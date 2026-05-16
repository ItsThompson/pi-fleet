import { create } from "zustand";
import type { ClusterDefinition } from "@pi-fleet/shared";

interface ClusterStoreState {
	/** Cluster definitions (id, name, directories, sortOrder) */
	clusters: ClusterDefinition[];
	/** Manual session-to-cluster overrides */
	manualAssignments: Record<string, string>;
	/** Loading flag for initial fetch */
	loading: boolean;
}

interface ClusterStoreActions {
	/** Hydrate from server response */
	setClusters: (
		clusters: ClusterDefinition[],
		manualAssignments: Record<string, string>,
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

	/** Manual assignment mutation (optimistic, from drag-and-drop or SSE confirmation) */
	setManualAssignment: (sessionId: string, clusterId: string | null) => void;
}

type ClusterStore = ClusterStoreState & ClusterStoreActions;

export const useClusterStore = create<ClusterStore>((set) => ({
	clusters: [],
	manualAssignments: {},
	loading: false,

	setClusters: (clusters, manualAssignments) => {
		set({ clusters, manualAssignments, loading: false });
	},

	setLoading: (loading) => {
		set({ loading });
	},

	addCluster: (cluster) => {
		set((state) => ({
			clusters: [...state.clusters, cluster],
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
		set((state) => ({
			clusters: state.clusters.filter((c) => c.id !== clusterId),
		}));
	},

	reorderClusters: (orderedIds) => {
		set((state) => {
			const reordered = orderedIds.reduce<ClusterDefinition[]>(
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

	setManualAssignment: (sessionId, clusterId) => {
		set((state) => {
			const next = { ...state.manualAssignments };
			if (clusterId === null) {
				delete next[sessionId];
			} else {
				next[sessionId] = clusterId;
			}
			return { manualAssignments: next };
		});
	},
}));
