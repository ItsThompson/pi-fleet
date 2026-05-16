import type {
	RegisteredSession,
	Pod,
	ClusterDefinition,
} from "@pi-fleet/shared";
import { isAttentionState, getStateChangedAt } from "@/lib/attention-utils";
import { getClusterForPod } from "@/lib/derived-clusters";
import type { NotificationEntry } from "./types";

/**
 * Derives notification entries from current session, pod, and cluster state.
 * Returns sessions needing attention (pending_approval or idle),
 * sorted by activityChangedAt descending (most recent first).
 *
 * Uses the shared assignment algorithm (via getClusterForPod) for cluster
 * name attribution: no cached podIds lookup needed.
 */
export function deriveNotificationEntries(
	sessions: Map<string, RegisteredSession>,
	pods: Map<string, Pod>,
	activityChangedAt: Map<string, string>,
	clusters: ClusterDefinition[],
	manualAssignments: Record<string, string>,
	homedir: string,
): NotificationEntry[] {
	const podBySessionId = new Map<string, Pod>();
	pods.forEach((pod) => {
		pod.memberSessionIds.forEach((id) => {
			podBySessionId.set(id, pod);
		});
	});

	const entries: NotificationEntry[] = [];

	sessions.forEach((session) => {
		if (!isAttentionState(session.activity)) {
			return;
		}

		const pod = podBySessionId.get(session.sessionId);
		const changedAt = getStateChangedAt(
			session.sessionId,
			activityChangedAt,
			session,
		);

		// Use the shared assignment algorithm for cluster attribution
		const cluster = pod
			? getClusterForPod(
					pod.leadSessionId,
					pods,
					sessions,
					clusters,
					manualAssignments,
					homedir,
				)
			: null;

		entries.push({
			sessionId: session.sessionId,
			sessionName:
				session.agentName ?? session.cwd.split("/").pop() ?? session.sessionId,
			podDisplayName: pod?.displayName ?? "Unknown",
			clusterName: cluster?.name ?? null,
			state: session.activity,
			stateChangedAt: changedAt,
		});
	});

	// Sort reverse-chronological (most recent state change first)
	entries.sort(
		(entryA, entryB) =>
			new Date(entryB.stateChangedAt).getTime() -
			new Date(entryA.stateChangedAt).getTime(),
	);

	return entries;
}
