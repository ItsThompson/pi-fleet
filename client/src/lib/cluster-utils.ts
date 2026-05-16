import type { Pod } from "@pi-fleet/shared";

export interface ClusterPodIds {
  /** Each cluster's array of pod IDs */
  clusteredPodIds: string[][];
  /** Pod IDs explicitly assigned to the unclustered group */
  unclusteredPodIds: string[];
}

/**
 * Compute the effective pod ID set for the "unclustered" view.
 * Includes server-assigned unclustered pods AND orphans:
 * pods not referenced by any cluster or the unclustered list.
 */
export function computeUnclusteredPodIds(
  allPods: Pod[],
  clusterData: ClusterPodIds,
): Set<string> {
  const assignedPodIds = new Set([
    ...clusterData.clusteredPodIds.flat(),
    ...clusterData.unclusteredPodIds,
  ]);

  const orphanIds = allPods.reduce<string[]>((acc, pod) => {
    if (!assignedPodIds.has(pod.leadSessionId)) {
      acc.push(pod.leadSessionId);
    }
    return acc;
  }, []);

  return new Set([...clusterData.unclusteredPodIds, ...orphanIds]);
}
