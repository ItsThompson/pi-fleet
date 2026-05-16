import { create } from "zustand";
import type { ClusterDefinition } from "@pi-fleet/shared";
import { getServerUrl } from "@/lib/bridge";
import {
  fetchClusters as apiFetchClusters,
  createCluster as apiCreateCluster,
  editCluster as apiEditCluster,
  deleteCluster as apiDeleteCluster,
  reorderClusters as apiReorderClusters,
  assignSession as apiAssignSession,
} from "@/api/cluster-api";

interface ClusterWithPods extends ClusterDefinition {
  podIds: string[];
  attentionCount: number;
}

interface UnclusteredState {
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

  /** Handle SSE: cluster created */
  addCluster: (cluster: ClusterDefinition) => void;

  /** Handle SSE: cluster updated */
  updateCluster: (cluster: ClusterDefinition) => void;

  /** Handle SSE: cluster deleted */
  removeCluster: (clusterId: string) => void;

  /** Handle SSE: clusters reordered */
  reorderClusters: (orderedIds: string[]) => void;

  /** Handle SSE: assignment changed */
  handleAssignmentChanged: (
    sessionId: string,
    clusterId: string | null,
  ) => void;

  /** Refetch clusters from server */
  fetchClusters: (baseUrl?: string) => Promise<void>;

  /** API: create cluster */
  createCluster: (
    name: string,
    directories?: string[],
    baseUrl?: string,
  ) => Promise<ClusterDefinition | null>;

  /** API: update cluster */
  editCluster: (
    id: string,
    updates: { name?: string; directories?: string[] },
    baseUrl?: string,
  ) => Promise<ClusterDefinition | null>;

  /** API: delete cluster */
  deleteCluster: (id: string, baseUrl?: string) => Promise<boolean>;

  /** API: reorder clusters */
  reorder: (orderedIds: string[], baseUrl?: string) => Promise<boolean>;

  /** API: assign session to cluster */
  assignSession: (
    sessionId: string,
    clusterId: string | null,
    baseUrl?: string,
  ) => Promise<boolean>;
}

function resolveBaseUrl(override?: string): string {
  return override || getServerUrl();
}

export const useClusterStore = create<ClusterStore>((set, get) => ({
  clusters: [],
  unclustered: { podIds: [], attentionCount: 0 },
  loading: false,

  setClusters: (clusters, unclustered) => {
    set({ clusters, unclustered, loading: false });
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
        existing.id === cluster.id
          ? { ...existing, ...cluster }
          : existing,
      ),
    }));
  },

  removeCluster: (clusterId) => {
    set((state) => {
      const removed = state.clusters.find((c) => c.id === clusterId);
      const remainingClusters = state.clusters.filter(
        (c) => c.id !== clusterId,
      );
      // Move pods from deleted cluster to unclustered
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

  handleAssignmentChanged: (_sessionId, _clusterId) => {
    // On assignment change, refetch full state for simplicity.
    // This avoids complex client-side tracking of pod-to-session mapping.
    get().fetchClusters();
  },

  fetchClusters: async (baseUrl?) => {
    const url = resolveBaseUrl(baseUrl);
    set({ loading: true });
    const result = await apiFetchClusters(url);
    if (result.ok) {
      set({
        clusters: result.data.clusters ?? [],
        unclustered: result.data.unclustered ?? { podIds: [], attentionCount: 0 },
        loading: false,
      });
    } else {
      set({ loading: false });
    }
  },

  createCluster: async (name, directories, baseUrl?) => {
    const url = resolveBaseUrl(baseUrl);
    const result = await apiCreateCluster(url, { name, directories });
    if (!result.ok) return null;
    return result.data;
  },

  editCluster: async (id, updates, baseUrl?) => {
    const url = resolveBaseUrl(baseUrl);
    const result = await apiEditCluster(url, id, updates);
    if (!result.ok) return null;
    return result.data;
  },

  deleteCluster: async (id, baseUrl?) => {
    const url = resolveBaseUrl(baseUrl);
    const result = await apiDeleteCluster(url, id);
    return result.ok;
  },

  reorder: async (orderedIds, baseUrl?) => {
    const url = resolveBaseUrl(baseUrl);
    const result = await apiReorderClusters(url, orderedIds);
    return result.ok;
  },

  assignSession: async (sessionId, clusterId, baseUrl?) => {
    const url = resolveBaseUrl(baseUrl);
    const result = await apiAssignSession(url, sessionId, clusterId);
    return result.ok;
  },
}));
