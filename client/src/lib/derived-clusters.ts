import { useMemo } from "react";
import type {
	ClusterDefinition,
	Pod,
	RegisteredSession,
	ClusterConfig,
} from "@pi-fleet/shared";
import {
	assignSessionToCluster,
	isAttentionState,
	inferHomedir,
} from "@pi-fleet/shared";
import { usePodStore } from "@/stores/pod-store";
import { useSessionStore } from "@/stores/session-store";
import { useClusterStore } from "@/stores/cluster-store";

/** A cluster enriched with its computed membership and attention count */
export interface DerivedCluster {
	/** The cluster definition */
	definition: ClusterDefinition;
	/** Pod IDs assigned to this cluster (lead session IDs) */
	podIds: string[];
	/** Total attention-state sessions across all pods in this cluster */
	attentionCount: number;
}

/** The "unclustered" bucket: pods that match no cluster */
export interface DerivedUnclustered {
	podIds: string[];
	attentionCount: number;
}

export interface DerivedClusterState {
	clusters: DerivedCluster[];
	unclustered: DerivedUnclustered;
}

/**
 * Compute full cluster membership from source-of-truth stores.
 *
 * Algorithm:
 * 1. For each pod, look up its lead session's cwd
 * 2. Run assignSessionToCluster against cluster definitions + manual assignments
 * 3. Group pods into clusters (or unclustered)
 * 4. For each cluster, sum attention across member sessions
 *
 * Pure function: deterministic, no side effects.
 */
export function deriveClusterState(
	pods: Map<string, Pod>,
	sessions: Map<string, RegisteredSession>,
	clusters: ClusterDefinition[],
	manualAssignments: Record<string, string>,
	homedir: string,
): DerivedClusterState {
	const config: ClusterConfig = {
		version: 1,
		clusters,
		manualAssignments,
	};

	// Initialize cluster buckets
	const clusterPodIds = new Map<string, string[]>();
	clusters.forEach((cluster) => {
		clusterPodIds.set(cluster.id, []);
	});
	const unclusteredPodIds: string[] = [];

	// Assign each pod to a cluster based on its lead session
	pods.forEach((pod) => {
		const leadSession = sessions.get(pod.leadSessionId);
		if (!leadSession) {
			// No session data available: unclustered
			unclusteredPodIds.push(pod.leadSessionId);
			return;
		}

		const assignment = assignSessionToCluster(
			leadSession.sessionId,
			leadSession.cwd,
			config,
			homedir,
		);

		if (assignment.clusterId && clusterPodIds.has(assignment.clusterId)) {
			clusterPodIds.get(assignment.clusterId)!.push(pod.leadSessionId);
		} else {
			unclusteredPodIds.push(pod.leadSessionId);
		}
	});

	// Compute attention for each cluster
	const derivedClusters: DerivedCluster[] = clusters.map((cluster) => {
		const podIds = clusterPodIds.get(cluster.id) ?? [];
		const attentionCount = podIds.reduce((sum, podId) => {
			const pod = pods.get(podId);
			if (!pod) {
				return sum;
			}
			return sum + computePodAttention(pod, sessions);
		}, 0);

		return { definition: cluster, podIds, attentionCount };
	});

	// Compute unclustered attention
	const unclusteredAttention = unclusteredPodIds.reduce((sum, podId) => {
		const pod = pods.get(podId);
		if (!pod) {
			return sum;
		}
		return sum + computePodAttention(pod, sessions);
	}, 0);

	return {
		clusters: derivedClusters,
		unclustered: {
			podIds: unclusteredPodIds,
			attentionCount: unclusteredAttention,
		},
	};
}

/**
 * Compute attention count for a single pod.
 * Counts member sessions whose activity is an attention state.
 */
export function computePodAttention(
	pod: Pod,
	sessions: Map<string, RegisteredSession>,
): number {
	return pod.memberSessionIds.reduce((count, sessionId) => {
		const session = sessions.get(sessionId);
		if (!session) {
			return count;
		}
		return isAttentionState(session.activity) ? count + 1 : count;
	}, 0);
}

/**
 * Find which cluster a specific pod belongs to.
 * Returns null if the pod is unclustered.
 */
export function getClusterForPod(
	podId: string,
	pods: Map<string, Pod>,
	sessions: Map<string, RegisteredSession>,
	clusters: ClusterDefinition[],
	manualAssignments: Record<string, string>,
	homedir: string,
): ClusterDefinition | null {
	const pod = pods.get(podId);
	if (!pod) {
		return null;
	}

	const leadSession = sessions.get(pod.leadSessionId);
	if (!leadSession) {
		return null;
	}

	const config: ClusterConfig = {
		version: 1,
		clusters,
		manualAssignments,
	};

	const assignment = assignSessionToCluster(
		leadSession.sessionId,
		leadSession.cwd,
		config,
		homedir,
	);

	if (!assignment.clusterId) {
		return null;
	}
	return clusters.find((c) => c.id === assignment.clusterId) ?? null;
}

// --- Hooks ---

/**
 * Resolve homedir from the first available session cwd.
 * Returns empty string if no sessions are available.
 */
function useHomedir(sessions: Map<string, RegisteredSession>): string {
	return useMemo(() => {
		for (const session of sessions.values()) {
			const homedir = inferHomedir(session.cwd);
			if (homedir) {
				return homedir;
			}
		}
		return "";
	}, [sessions]);
}

/**
 * Hook: returns derived cluster state, recomputed when any input store changes.
 * Uses useMemo for render-cycle memoization.
 */
export function useDerivedClusters(): DerivedClusterState {
	const pods = usePodStore((state) => state.pods);
	const sessions = useSessionStore((state) => state.sessions);
	const clusters = useClusterStore((state) => state.clusters);
	const manualAssignments = useClusterStore((state) => state.manualAssignments);
	const homedir = useHomedir(sessions);

	return useMemo(
		() =>
			deriveClusterState(pods, sessions, clusters, manualAssignments, homedir),
		[pods, sessions, clusters, manualAssignments, homedir],
	);
}

/**
 * Hook: returns the DerivedCluster for a specific cluster ID.
 * Returns undefined if the cluster doesn't exist.
 */
export function useDerivedCluster(
	clusterId: string,
): DerivedCluster | undefined {
	const derived = useDerivedClusters();
	return useMemo(
		() => derived.clusters.find((c) => c.definition.id === clusterId),
		[derived.clusters, clusterId],
	);
}

/**
 * Hook: returns the unclustered bucket.
 */
export function useDerivedUnclustered(): DerivedUnclustered {
	const derived = useDerivedClusters();
	return derived.unclustered;
}

/**
 * Hook: returns the cluster a specific pod belongs to.
 * Returns null if unclustered.
 */
export function useClusterForPod(podId: string): ClusterDefinition | null {
	const pods = usePodStore((state) => state.pods);
	const sessions = useSessionStore((state) => state.sessions);
	const clusters = useClusterStore((state) => state.clusters);
	const manualAssignments = useClusterStore((state) => state.manualAssignments);
	const homedir = useHomedir(sessions);

	return useMemo(
		() =>
			getClusterForPod(
				podId,
				pods,
				sessions,
				clusters,
				manualAssignments,
				homedir,
			),
		[podId, pods, sessions, clusters, manualAssignments, homedir],
	);
}
