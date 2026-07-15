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
	private readonly lastEmittedState = new Map<
		string,
		{ state: ActivityStatus; attentionCount: number }
	>();

	constructor(deps: PodRegistryDeps) {
		this.sessionRegistry = deps.sessionRegistry;
	}

	onEvent(listener: PodEventListener): () => void {
		this.listeners.push(listener);
		return () => {
			const idx = this.listeners.indexOf(listener);
			if (idx >= 0) {
				this.listeners.splice(idx, 1);
			}
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

		// Find the root ancestor: if this session is an intermediate node,
		// the root's pod should be updated
		const rootId = this.findRootAncestor(parentSessionId);

		if (!previousIds) {
			// First ownership report
			if (matchedIds.length > 0) {
				if (rootId === parentSessionId) {
					// This is the root: pod is being formed
					this.emit({
						type: "pod:formed",
						pod: this.buildPod(parentSessionId),
					});
				} else {
					// This is an intermediate node: root's pod updates
					this.emit({
						type: "pod:updated",
						pod: this.buildPod(rootId),
					});
				}
			}
		} else {
			// Subsequent report: pod updated
			this.emit({ type: "pod:updated", pod: this.buildPod(rootId) });
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
		if (!leadId) {
			return;
		}

		const leadSession = this.sessionRegistry.get(leadId);
		if (!leadSession) {
			return;
		}

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
	 * Walks up to the root ancestor for deep trees.
	 */
	private findLeadForSession(sessionId: string): string | undefined {
		const session = this.sessionRegistry.get(sessionId);
		if (!session) {
			return undefined;
		}

		const rootId = this.findRootAncestor(sessionId);
		// Verify root exists and has ownership (is actually a pod lead)
		if (this.ownershipMap.has(rootId)) {
			return rootId;
		}
		// Not in a multi-member pod: standalone session
		return sessionId;
	}

	private findParentBySubagentId(subagentId: string): string | undefined {
		for (const [parentId, subagentIds] of this.ownershipMap) {
			if (subagentIds.includes(subagentId)) {
				return parentId;
			}
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
		if (!session?.subagentId) {
			return;
		}

		// Check if any parent has explicitly claimed this subagentId
		for (const [parentId, subagentIds] of this.ownershipMap) {
			if (subagentIds.includes(session.subagentId)) {
				const parentSession = this.sessionRegistry.get(parentId);
				if (parentSession) {
					// Walk up to root ancestor and emit for the root's pod
					const rootId = this.findRootAncestor(parentId);
					this.emit({ type: "pod:updated", pod: this.buildPod(rootId) });
				}
				return;
			}
		}

		// No explicit ownership: infer parent from CWD.
		// If exactly one non-subagent session shares the same cwd, treat it as parent.
		const candidates = this.sessionRegistry
			.getAll()
			.filter(
				(other) =>
					other.sessionId !== sessionId &&
					other.cwd === session.cwd &&
					!other.subagentId,
			);

		if (candidates.length !== 1) {
			return;
		}

		const inferredParent = candidates[0];
		const existingIds = this.ownershipMap.get(inferredParent.sessionId) ?? [];
		if (!existingIds.includes(session.subagentId)) {
			this.ownershipMap.set(inferredParent.sessionId, [
				...existingIds,
				session.subagentId,
			]);
		}

		// Walk up to root ancestor for the inferred parent
		const rootId = this.findRootAncestor(inferredParent.sessionId);
		const isFirstOwnership = existingIds.length === 0;

		this.emit({
			type: isFirstOwnership ? "pod:formed" : "pod:updated",
			pod: this.buildPod(rootId),
		});
	}

	/**
	 * Called when a session is removed.
	 * Handles three cases:
	 * 1. Root parent dies: children form their own pods (multi-member if they have ownership)
	 * 2. Intermediate node dies: grandparent pod shrinks, orphaned children become roots
	 * 3. Leaf child dies: parent's pod updates
	 */
	handleSessionRemoved(sessionId: string): void {
		const isParent = this.ownershipMap.has(sessionId);

		if (isParent) {
			// This session had its own ownership entry (root or intermediate)
			const subagentIds = this.ownershipMap.get(sessionId)!;
			this.ownershipMap.delete(sessionId);

			// Check if this session was also claimed by a grandparent
			const orphanInfo = this.findOrphanedSubagentId();
			if (orphanInfo) {
				// Intermediate death: remove from grandparent's ownership list
				const grandparentIds = this.ownershipMap.get(orphanInfo.parentId) ?? [];
				this.ownershipMap.set(
					orphanInfo.parentId,
					grandparentIds.filter((id) => id !== orphanInfo.subagentId),
				);

				// Emit pod:updated for the grandparent's root pod
				const rootId = this.findRootAncestor(orphanInfo.parentId);
				const rootSession = this.sessionRegistry.get(rootId);
				if (rootSession) {
					this.emit({ type: "pod:updated", pod: this.buildPod(rootId) });
				}
			} else {
				// Root death: emit pod:dissolved
				this.emit({ type: "pod:dissolved", leadSessionId: sessionId });
			}

			// Each direct child: form their own pod (multi-member if they have ownership)
			subagentIds.forEach((subagentId) => {
				const childSession = this.findSessionBySubagentId(subagentId);
				if (!childSession) {
					return;
				}

				if (this.ownershipMap.has(childSession.sessionId)) {
					// Child has its own ownership: promote to multi-member pod root
					this.emit({
						type: "pod:formed",
						pod: this.buildPod(childSession.sessionId),
					});
				} else {
					// Child has no ownership: standalone pod
					this.emit({
						type: "pod:formed",
						pod: this.buildSingleMemberPod(childSession),
					});
				}
			});
			return;
		}

		// Case 2: The removed session is a leaf child
		const orphanInfo = this.findOrphanedSubagentId();
		if (!orphanInfo) {
			return;
		}

		// Clean the stale subagentId from the parent's ownership list
		const parentIds = this.ownershipMap.get(orphanInfo.parentId) ?? [];
		const cleaned = parentIds.filter((id) => id !== orphanInfo.subagentId);
		if (cleaned.length > 0) {
			this.ownershipMap.set(orphanInfo.parentId, cleaned);
		} else {
			this.ownershipMap.delete(orphanInfo.parentId);
		}

		// Find the root of the affected pod and emit update
		const rootId = this.findRootAncestor(orphanInfo.parentId);
		const rootSession = this.sessionRegistry.get(rootId);
		if (rootSession) {
			if (this.ownershipMap.has(rootId)) {
				this.emit({ type: "pod:updated", pod: this.buildPod(rootId) });
			} else {
				// Root lost all children: emit updated single-member pod
				this.emit({
					type: "pod:updated",
					pod: this.buildSingleMemberPod(rootSession),
				});
			}
		}
	}

	/**
	 * Get all computed pods.
	 * Identifies root sessions (those not claimed by any other parent),
	 * collects their full subtrees, and builds one pod per root.
	 * Sessions without ownership are single-member pods.
	 */
	getPods(): Pod[] {
		const allSessions = this.sessionRegistry.getAll();
		const claimedSessionIds = new Set<string>();
		const pods: Pod[] = [];

		// Build the set of all subagentIds claimed by any parent
		const allClaimedSubagentIds = new Set<string>();
		this.ownershipMap.forEach((subagentIds) => {
			subagentIds.forEach((id) => allClaimedSubagentIds.add(id));
		});

		// Identify root sessions: those that have an ownershipMap entry
		// and whose subagentId is NOT claimed by any other parent
		const roots: string[] = [];
		this.ownershipMap.forEach((_subagentIds, parentId) => {
			const parentSession = this.sessionRegistry.get(parentId);
			if (!parentSession) {
				return;
			}

			// A root has no subagentId, or its subagentId is not claimed by anyone
			if (
				!parentSession.subagentId ||
				!allClaimedSubagentIds.has(parentSession.subagentId)
			) {
				roots.push(parentId);
			}
		});

		// Build multi-member pods from each root's full subtree
		roots.forEach((rootId) => {
			const pod = this.buildPod(rootId);
			pod.memberSessionIds.forEach((id) => claimedSessionIds.add(id));
			pods.push(pod);
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
	 * Walk up the ownership graph to find the root ancestor of a session.
	 * Uses a visited set for cycle detection: if a cycle is found,
	 * treats the current session as the root.
	 */
	private findRootAncestor(sessionId: string): string {
		const visited = new Set<string>();
		let currentId = sessionId;

		while (true) {
			if (visited.has(currentId)) {
				// Cycle detected: treat this session as root
				return currentId;
			}
			visited.add(currentId);

			const session = this.sessionRegistry.get(currentId);
			if (!session?.subagentId) {
				return currentId;
			}

			const parentId = this.findParentBySubagentId(session.subagentId);
			if (!parentId) {
				return currentId;
			}

			currentId = parentId;
		}
	}

	/**
	 * Walk down the ownership graph collecting all reachable descendants.
	 * Uses a visited set for cycle detection: skips already-visited nodes.
	 */
	private collectDescendants(
		sessionId: string,
		visited: Set<string> = new Set(),
	): RegisteredSession[] {
		const descendants: RegisteredSession[] = [];
		const subagentIds = this.ownershipMap.get(sessionId);
		if (!subagentIds) {
			return descendants;
		}

		visited.add(sessionId);

		subagentIds.forEach((subagentId) => {
			const childSession = this.findSessionBySubagentId(subagentId);
			if (!childSession || visited.has(childSession.sessionId)) {
				return;
			}
			descendants.push(childSession);
			const grandchildren = this.collectDescendants(
				childSession.sessionId,
				visited,
			);
			descendants.push(...grandchildren);
		});

		return descendants;
	}

	/**
	 * Find a subagentId in the ownershipMap that no longer resolves to a
	 * registered session. Returns the parentId and orphaned subagentId
	 * so the caller can clean up the grandparent's ownership list.
	 */
	private findOrphanedSubagentId():
		| {
				parentId: string;
				subagentId: string;
		  }
		| undefined {
		for (const [parentId, subagentIds] of this.ownershipMap) {
			const parentSession = this.sessionRegistry.get(parentId);
			if (!parentSession) {
				continue;
			}

			const orphaned = subagentIds.find(
				(id) => !this.findSessionBySubagentId(id),
			);
			if (orphaned) {
				return { parentId, subagentId: orphaned };
			}
		}
		return undefined;
	}

	private buildPod(rootId: string): Pod {
		const rootSession = this.sessionRegistry.get(rootId)!;
		const descendants = this.collectDescendants(rootId);
		const memberSessions: RegisteredSession[] = [rootSession, ...descendants];
		return this.buildPodFromMembers(rootSession, memberSessions);
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
		if (session.agentName) {
			return session.agentName;
		}
		// Fall back to directory basename of cwd
		const parts = session.cwd.split("/");
		return parts[parts.length - 1] || session.cwd;
	}

	/**
	 * Pod state = worst state among members.
	 * Priority: pending_approval > processing > running_tool > idle
	 * members is always non-empty (the lead is always a member), so reduce needs no seed.
	 */
	private aggregateState(members: RegisteredSession[]): ActivityStatus {
		const worstMember = members.reduce((worst, member) =>
			STATE_PRIORITY[member.activity] > STATE_PRIORITY[worst.activity]
				? member
				: worst,
		);
		return worstMember.activity;
	}

	/**
	 * Count of members with pending_approval or idle (states needing attention).
	 */
	private computeAttentionCount(members: RegisteredSession[]): number {
		return members.filter((m) => isAttentionState(m.activity)).length;
	}
}
