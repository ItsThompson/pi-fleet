import type { RegisteredSession, Pod, ClusterDefinition } from "@pi-fleet/shared";
import type { NotificationEntry } from "./types";

interface ClusterWithPods extends ClusterDefinition {
  podIds: string[];
}

/**
 * Derives notification entries from current session, pod, and cluster state.
 * Returns sessions needing attention (pending_approval or idle),
 * sorted by activityChangedAt descending (most recent first).
 */
export function deriveNotificationEntries(
  sessions: Map<string, RegisteredSession>,
  pods: Map<string, Pod>,
  activityChangedAt: Map<string, string>,
  clusters: ClusterWithPods[],
): NotificationEntry[] {
  const podBySessionId = new Map<string, Pod>();
  pods.forEach((pod) => {
    pod.memberSessionIds.forEach((id) => {
      podBySessionId.set(id, pod);
    });
  });

  // Build pod leadSessionId → cluster name lookup
  const clusterNameByPodId = new Map<string, string>();
  clusters.forEach((cluster) => {
    cluster.podIds.forEach((podId) => {
      clusterNameByPodId.set(podId, cluster.name);
    });
  });

  const entries: NotificationEntry[] = [];

  sessions.forEach((session) => {
    if (session.activity !== "pending_approval" && session.activity !== "idle") {
      return;
    }

    const pod = podBySessionId.get(session.sessionId);
    const changedAt = activityChangedAt.get(session.sessionId) ?? session.lastSeen;
    const clusterName = pod ? (clusterNameByPodId.get(pod.leadSessionId) ?? null) : null;

    entries.push({
      sessionId: session.sessionId,
      sessionName: session.agentName ?? session.cwd.split("/").pop() ?? session.sessionId,
      podDisplayName: pod?.displayName ?? "Unknown",
      clusterName,
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
