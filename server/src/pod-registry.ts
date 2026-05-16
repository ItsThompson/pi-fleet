import type { Pod, ActivityStatus, RegisteredSession } from "@pi-fleet/shared";
import { STATE_PRIORITY, isAttentionState } from "@pi-fleet/shared";
import type { SessionRegistry } from "./session-registry.js";

export type PodEvent =
  | { type: "pod:formed"; pod: Pod }
  | { type: "pod:updated"; pod: Pod }
  | { type: "pod:dissolved"; leadSessionId: string };

export type PodEventListener = (event: PodEvent) => void;

export interface PodRegistryDeps {
  sessionRegistry: SessionRegistry;
}

/**
 * Computes pods from sessions and ownership reports.
 *
 * A Pod is a computed grouping of a parent session and its subagent children.
 * Sessions without ownership reports exist as single-member pods.
 */
export class PodRegistry {
  private readonly sessionRegistry: SessionRegistry;
  private readonly listeners: PodEventListener[] = [];

  /**
   * parentSessionId → subagentIds (from ownership reports).
   * Pending subagentIds that haven't registered yet are kept here
   * and matched when those sessions later register.
   */
  private readonly ownershipMap = new Map<string, string[]>();

  /**
   * Cache of last-emitted pod state per leadSessionId.
   * Used to detect actual changes and avoid redundant pod:updated events.
   */
  private readonly lastEmittedState = new Map<string, { state: ActivityStatus; attentionCount: number }>();

  constructor(deps: PodRegistryDeps) {
    this.sessionRegistry = deps.sessionRegistry;
  }

  onEvent(listener: PodEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  private emit(event: PodEvent): void {
    // Update last-emitted state cache
    if (event.type === "pod:formed" || event.type === "pod:updated") {
      this.lastEmittedState.set(event.pod.leadSessionId, {
        state: event.pod.state,
        attentionCount: event.pod.attentionCount,
      });
    } else if (event.type === "pod:dissolved") {
      this.lastEmittedState.delete(event.leadSessionId);
    }
    this.listeners.forEach((listener) => listener(event));
  }

  /**
   * Called when a parent reports its subagent IDs.
   * Returns which IDs matched registered sessions and which did not.
   */
  reportOwnership(
    parentSessionId: string,
    subagentIds: string[],
  ): { matchedIds: string[]; unmatchedIds: string[] } {
    const previousIds = this.ownershipMap.get(parentSessionId);
    this.ownershipMap.set(parentSessionId, subagentIds);

    const matchedIds: string[] = [];
    const unmatchedIds: string[] = [];

    subagentIds.forEach((subagentId) => {
      const session = this.findSessionBySubagentId(subagentId);
      if (session) {
        matchedIds.push(subagentId);
      } else {
        unmatchedIds.push(subagentId);
      }
    });

    // Determine what changed and emit appropriate events
    const parentSession = this.sessionRegistry.get(parentSessionId);
    if (!parentSession) {
      return { matchedIds, unmatchedIds };
    }

    if (!previousIds) {
      // First ownership report: pod is being formed (was single-member before)
      if (matchedIds.length > 0) {
        this.emit({ type: "pod:formed", pod: this.buildPod(parentSessionId) });
      }
    } else {
      // Subsequent report: pod updated
      this.emit({ type: "pod:updated", pod: this.buildPod(parentSessionId) });
    }

    return { matchedIds, unmatchedIds };
  }

  /**
   * Called when a session's data is updated (e.g., heartbeat with new activity).
   * Recomputes the pod containing this session and emits pod:updated if state changed.
   */
  handleSessionUpdated(sessionId: string): void {
    // Find which pod this session belongs to
    const leadId = this.findLeadForSession(sessionId);
    if (!leadId) return;

    const leadSession = this.sessionRegistry.get(leadId);
    if (!leadSession) return;

    // Recompute the pod's current state from live session data
    const freshPod = this.ownershipMap.has(leadId)
      ? this.buildPod(leadId)
      : this.buildSingleMemberPod(leadSession);

    // Compare against last-emitted state to avoid redundant events
    const lastState = this.lastEmittedState.get(leadId);
    if (
      !lastState ||
      freshPod.state !== lastState.state ||
      freshPod.attentionCount !== lastState.attentionCount
    ) {
      this.lastEmittedState.set(leadId, {
        state: freshPod.state,
        attentionCount: freshPod.attentionCount,
      });
      this.emit({ type: "pod:updated", pod: freshPod });
    }
  }

  /**
   * Find the lead session ID for the pod containing this session.
   */
  private findLeadForSession(sessionId: string): string | undefined {
    // Check if this session IS a lead (has ownership or is standalone)
    if (this.sessionRegistry.get(sessionId)) {
      // Check if it's a child claimed by a parent
      const session = this.sessionRegistry.get(sessionId);
      if (session?.subagentId) {
        for (const [parentId, subagentIds] of this.ownershipMap) {
          if (subagentIds.includes(session.subagentId)) {
            return parentId;
          }
        }
      }
      // It's either a standalone session or a parent itself
      return sessionId;
    }
    return undefined;
  }

  /**
   * Called when a session registers. Re-evaluates pending ownership
   * to see if this new session is claimed by any parent.
   * Falls back to CWD-based inference if no explicit ownership exists.
   */
  handleSessionRegistered(sessionId: string): void {
    const session = this.sessionRegistry.get(sessionId);
    if (!session?.subagentId) return;

    // Check if any parent has explicitly claimed this subagentId
    for (const [parentId, subagentIds] of this.ownershipMap) {
      if (subagentIds.includes(session.subagentId)) {
        const parentSession = this.sessionRegistry.get(parentId);
        if (parentSession) {
          this.emit({ type: "pod:updated", pod: this.buildPod(parentId) });
        }
        return;
      }
    }

    // No explicit ownership: infer parent from CWD.
    // If exactly one non-subagent session shares the same cwd, treat it as parent.
    const candidates = this.sessionRegistry.getAll().filter(
      (other) =>
        other.sessionId !== sessionId &&
        other.cwd === session.cwd &&
        !other.subagentId,
    );

    if (candidates.length !== 1) return;

    const inferredParent = candidates[0];
    const existingIds = this.ownershipMap.get(inferredParent.sessionId) ?? [];
    if (!existingIds.includes(session.subagentId)) {
      this.ownershipMap.set(
        inferredParent.sessionId,
        [...existingIds, session.subagentId],
      );
    }

    this.emit({
      type: existingIds.length === 0 ? "pod:formed" : "pod:updated",
      pod: this.buildPod(inferredParent.sessionId),
    });
  }

  /**
   * Called when a session is removed.
   * If parent: children become independent pods (dissolved + new formed events).
   * If child: removed from pod, pod:updated emitted.
   */
  handleSessionRemoved(sessionId: string): void {
    // Case 1: The removed session is a parent
    if (this.ownershipMap.has(sessionId)) {
      const subagentIds = this.ownershipMap.get(sessionId)!;
      this.ownershipMap.delete(sessionId);

      // Emit pod:dissolved for the parent's pod
      this.emit({ type: "pod:dissolved", leadSessionId: sessionId });

      // Each child that is still registered becomes an independent single-member pod
      subagentIds.forEach((subagentId) => {
        const childSession = this.findSessionBySubagentId(subagentId);
        if (childSession) {
          this.emit({
            type: "pod:formed",
            pod: this.buildSingleMemberPod(childSession),
          });
        }
      });
      return;
    }

    // Case 2: The removed session is a child
    const session = this.findRemovedSessionSubagentId(sessionId);
    if (!session) return;

    for (const [parentId] of this.ownershipMap) {
      const parentSession = this.sessionRegistry.get(parentId);
      if (parentSession) {
        // Check if this child was part of this parent's pod
        const pod = this.buildPod(parentId);
        // The child is already removed from registry, so just emit update
        this.emit({ type: "pod:updated", pod });
        return;
      }
    }
  }

  /**
   * Get all computed pods.
   * Sessions under a parent's ownership are grouped.
   * Sessions without ownership are single-member pods.
   */
  getPods(): Pod[] {
    const allSessions = this.sessionRegistry.getAll();
    const claimedSessionIds = new Set<string>();
    const pods: Pod[] = [];

    // Build multi-member pods from ownership reports
    this.ownershipMap.forEach((subagentIds, parentId) => {
      const parentSession = this.sessionRegistry.get(parentId);
      if (!parentSession) return;

      claimedSessionIds.add(parentId);
      const memberSessions: RegisteredSession[] = [parentSession];

      subagentIds.forEach((subagentId) => {
        const childSession = this.findSessionBySubagentId(subagentId);
        if (childSession) {
          claimedSessionIds.add(childSession.sessionId);
          memberSessions.push(childSession);
        }
      });

      pods.push(this.buildPodFromMembers(parentSession, memberSessions));
    });

    // Infer pods for unclaimed subagent sessions via CWD matching.
    // Groups a child with its parent when exactly one non-subagent session
    // shares the same cwd (avoids ambiguity with multiple candidates).
    const inferredGroups = new Map<string, RegisteredSession[]>();
    allSessions.forEach((session) => {
      if (claimedSessionIds.has(session.sessionId)) return;
      if (!session.subagentId) return;

      const candidates = allSessions.filter(
        (other) =>
          other.sessionId !== session.sessionId &&
          other.cwd === session.cwd &&
          !other.subagentId &&
          !claimedSessionIds.has(other.sessionId),
      );
      if (candidates.length !== 1) return;

      const parent = candidates[0];
      claimedSessionIds.add(session.sessionId);
      claimedSessionIds.add(parent.sessionId);

      const group = inferredGroups.get(parent.sessionId) ?? [parent];
      group.push(session);
      inferredGroups.set(parent.sessionId, group);
    });

    inferredGroups.forEach((members, parentId) => {
      const parent = members[0];
      pods.push(this.buildPodFromMembers(parent, members));
    });

    // Build single-member pods for unclaimed sessions
    allSessions.forEach((session) => {
      if (!claimedSessionIds.has(session.sessionId)) {
        pods.push(this.buildSingleMemberPod(session));
      }
    });

    return pods;
  }

  /**
   * Get the pod containing a specific session.
   */
  getPodForSession(sessionId: string): Pod | undefined {
    return this.getPods().find((pod) =>
      pod.memberSessionIds.includes(sessionId),
    );
  }

  get podCount(): number {
    return this.getPods().length;
  }

  // --- Private helpers ---

  private findSessionBySubagentId(
    subagentId: string,
  ): RegisteredSession | undefined {
    return this.sessionRegistry
      .getAll()
      .find((session) => session.subagentId === subagentId);
  }

  /**
   * When a session is removed, we can't look it up anymore.
   * Check if any parent's ownership list references a subagentId
   * that no longer maps to a registered session.
   * Returns a synthetic marker if found, undefined otherwise.
   */
  private findRemovedSessionSubagentId(
    _sessionId: string,
  ): { found: true } | undefined {
    // We can't look up the removed session's subagentId directly since
    // it's already gone from the registry. Instead, we check all pods
    // and emit updates for any that have changed membership.
    for (const [parentId, subagentIds] of this.ownershipMap) {
      const parentSession = this.sessionRegistry.get(parentId);
      if (!parentSession) continue;

      // If any claimed subagentId no longer resolves, this pod was affected
      const hasUnresolved = subagentIds.some(
        (id) => !this.findSessionBySubagentId(id),
      );
      if (hasUnresolved) {
        return { found: true };
      }
    }
    return undefined;
  }

  private buildPod(parentId: string): Pod {
    const parentSession = this.sessionRegistry.get(parentId)!;
    const subagentIds = this.ownershipMap.get(parentId) ?? [];
    const memberSessions: RegisteredSession[] = [parentSession];

    subagentIds.forEach((subagentId) => {
      const childSession = this.findSessionBySubagentId(subagentId);
      if (childSession) {
        memberSessions.push(childSession);
      }
    });

    return this.buildPodFromMembers(parentSession, memberSessions);
  }

  private buildPodFromMembers(
    leadSession: RegisteredSession,
    members: RegisteredSession[],
  ): Pod {
    return {
      leadSessionId: leadSession.sessionId,
      memberSessionIds: members.map((m) => m.sessionId),
      displayName: this.computeDisplayName(leadSession),
      state: this.aggregateState(members),
      attentionCount: this.computeAttentionCount(members),
    };
  }

  private buildSingleMemberPod(session: RegisteredSession): Pod {
    return {
      leadSessionId: session.sessionId,
      memberSessionIds: [session.sessionId],
      displayName: this.computeDisplayName(session),
      state: session.activity,
      attentionCount: isAttentionState(session.activity) ? 1 : 0,
    };
  }

  private computeDisplayName(session: RegisteredSession): string {
    if (session.agentName) return session.agentName;
    // Fall back to directory basename of cwd
    const parts = session.cwd.split("/");
    return parts[parts.length - 1] || session.cwd;
  }

  /**
   * Pod state = worst state among members.
   * Priority: pending_approval > idle > running_tool > processing
   */
  private aggregateState(members: RegisteredSession[]): ActivityStatus {
    return members.reduce<ActivityStatus>((worst, member) => {
      if (STATE_PRIORITY[member.activity] > STATE_PRIORITY[worst]) {
        return member.activity;
      }
      return worst;
    }, "processing");
  }

  /**
   * Count of members with pending_approval or idle (states needing attention).
   */
  private computeAttentionCount(members: RegisteredSession[]): number {
    return members.filter((m) => isAttentionState(m.activity)).length;
  }
}
