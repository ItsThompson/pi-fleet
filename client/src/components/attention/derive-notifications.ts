import type { RegisteredSession, Pod } from "@pi-fleet/shared";
import type { NotificationEntry } from "./types";

/**
 * Derives notification entries from current session and pod state.
 * Returns sessions needing attention (pending_approval or idle),
 * sorted by activityChangedAt descending (most recent first).
 */
export function deriveNotificationEntries(
  sessions: Map<string, RegisteredSession>,
  pods: Map<string, Pod>,
  activityChangedAt: Map<string, string>,
): NotificationEntry[] {
  const podBySessionId = new Map<string, Pod>();
  pods.forEach((pod) => {
    pod.memberSessionIds.forEach((id) => {
      podBySessionId.set(id, pod);
    });
  });

  const entries: NotificationEntry[] = [];

  sessions.forEach((session) => {
    if (session.activity !== "pending_approval" && session.activity !== "idle") {
      return;
    }

    const pod = podBySessionId.get(session.sessionId);
    const changedAt = activityChangedAt.get(session.sessionId) ?? session.lastSeen;

    entries.push({
      sessionId: session.sessionId,
      sessionName: session.agentName ?? session.cwd.split("/").pop() ?? session.sessionId,
      podDisplayName: pod?.displayName ?? "Unknown",
      clusterName: null, // Cluster assignment tracked separately
      state: session.activity,
      stateChangedAt: changedAt,
    });
  });

  // Sort reverse-chronological (most recent state change first)
  entries.sort((entryA, entryB) =>
    new Date(entryB.stateChangedAt).getTime() - new Date(entryA.stateChangedAt).getTime()
  );

  return entries;
}
