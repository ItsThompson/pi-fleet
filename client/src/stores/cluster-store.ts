import { create } from "zustand";
import type { ClusterDefinition } from "@pi-fleet/shared";

export interface ClusterWithPods extends ClusterDefinition {
	podIds: string[];
	attentionCount: number;
}

export interface UnclusteredState {
	podIds: string[];
	attentionCount: number;
}

interface ClusterStore {
	clusters: ClusterWithPods[];
	unclustered: UnclusteredState;
	loading: boolean;

	/** Set full cluster state from API response */
	setClusters: (
		clusters: ClusterWithPods[],
		unclustered: UnclusteredState,
	) => void;

	/** Set loading state */
	setLoading: (loading: boolean) => void;

	/** Handle SSE: cluster created */
	addCluster: (cluster: ClusterDefinition) => void;

	/** Handle SSE: cluster updated */
	updateCluster: (cluster: ClusterDefinition) => void;

	/** Handle SSE: cluster deleted */
	removeCluster: (clusterId: string) => void;

	/** Handle SSE: clusters reordered */
	reorderClusters: (orderedIds: string[]) => void;
}

export const useClusterStore = create<ClusterStore>((set) => ({
	clusters: [],
	unclustered: { podIds: [], attentionCount: 0 },
	loading: false,

	setClusters: (clusters, unclustered) => {
		set({ clusters, unclustered, loading: false });
	},

	setLoading: (loading) => {
		set({ loading });
	},

	addCluster: (cluster) => {
		set((state) => ({
			clusters: [
				...state.clusters,
				{ ...cluster, podIds: [], attentionCount: 0 },
			],
		}));
	},

	updateCluster: (cluster) => {
		set((state) => ({
			clusters: state.clusters.map((existing) =>
				existing.id === cluster.id ? { ...existing, ...cluster } : existing,
			),
		}));
	},

	removeCluster: (clusterId) => {
		set((state) => {
			const removed = state.clusters.find((c) => c.id === clusterId);
			const remainingClusters = state.clusters.filter(
				(c) => c.id !== clusterId,
			);
			const movedPodIds = removed?.podIds ?? [];
			const movedAttention = removed?.attentionCount ?? 0;
			return {
				clusters: remainingClusters,
				unclustered: {
					podIds: [...state.unclustered.podIds, ...movedPodIds],
					attentionCount: state.unclustered.attentionCount + movedAttention,
				},
			};
		});
	},

	reorderClusters: (orderedIds) => {
		set((state) => {
			const reordered = orderedIds.reduce<ClusterWithPods[]>(
				(acc, id, index) => {
					const cluster = state.clusters.find((c) => c.id === id);
					if (cluster) {
						acc.push({ ...cluster, sortOrder: index });
					}
					return acc;
				},
				[],
			);
			return { clusters: reordered };
		});
	},
}));
