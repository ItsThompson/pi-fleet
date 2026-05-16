import { useState } from "react";
import type { RegisteredSession } from "@pi-fleet/shared";
import { UNCLUSTERED_ID } from "@pi-fleet/shared";
import { usePodStore } from "@/stores/pod-store";
import { useSessionStore } from "@/stores/session-store";
import { useClusterStore } from "@/stores/cluster-store";
import { useFilteredPods } from "@/hooks/useFilteredPodGrid";
import { PodGrid } from "@/components/shared/PodGrid";
import { PodCard } from "@/components/pods/PodCard";
import { FilterBadges } from "@/components/attention/FilterBadges";
import { ClusterHeader } from "@/components/clusters/ClusterHeader";
import { ClusterForm } from "@/components/clusters/ClusterForm";
import { ScrollArea } from "@/components/ui/scroll-area";
import { computeUnclusteredPodIds } from "@/lib/cluster-utils";
import { getServerUrl } from "@/lib/bridge";
import { deleteCluster } from "@/api/cluster-api";

interface ClusterViewProps {
  clusterId: string;
}

export function ClusterView({ clusterId }: ClusterViewProps) {
  const pods = usePodStore((state) => state.pods);
  const sessions = useSessionStore((state) => state.sessions);
  const cluster = useClusterStore((state) =>
    state.clusters.find((c) => c.id === clusterId),
  );
  const clusters = useClusterStore((state) => state.clusters);
  const unclustered = useClusterStore((state) => state.unclustered);
  const [showEditForm, setShowEditForm] = useState(false);

  const isUnclustered = clusterId === UNCLUSTERED_ID;

  if (!isUnclustered && !cluster) {
    return (
      <div className="p-4 text-muted-foreground">
        Cluster not found.
      </div>
    );
  }

  // Determine which pod IDs belong to this view
  const allPods = Array.from(pods.values());
  let podIdSet: Set<string>;
  if (isUnclustered) {
    podIdSet = computeUnclusteredPodIds(allPods, {
      clusteredPodIds: clusters.map((c) => c.podIds),
      unclusteredPodIds: unclustered.podIds,
    });
  } else {
    podIdSet = new Set(cluster!.podIds);
  }

  const clusterPods = allPods.filter((pod) =>
    podIdSet.has(pod.leadSessionId),
  );

  // Use shared hook for filtering and attention/working split
  const grid = useFilteredPods(clusterPods);

  // Compute all sessions in this cluster's pods for filter badge counts
  const viewSessions = clusterPods.reduce<RegisteredSession[]>((acc, pod) => {
    pod.memberSessionIds.forEach((id) => {
      const session = sessions.get(id);
      if (session) acc.push(session);
    });
    return acc;
  }, []);

  // Count manual assignments (approximate from pod count vs directory matches)
  const manualCount = 0; // This would require server-side info; kept for display

  async function handleDelete(): Promise<void> {
    if (isUnclustered) return;
    const confirmed = window.confirm(
      `Delete cluster "${cluster!.name}"? Pods will move to Unclustered.`,
    );
    if (!confirmed) return;
    const result = await deleteCluster(getServerUrl(), cluster!.id);
    if (!result.ok) {
      console.error("Failed to delete cluster:", result.error);
    }
  }

  return (
    <ScrollArea className="h-full p-4">
      {isUnclustered ? (
        <h2 className="text-lg font-semibold mb-4">Unclustered</h2>
      ) : (
        <ClusterHeader
          cluster={cluster!}
          manualCount={manualCount}
          onEdit={() => setShowEditForm(true)}
          onDelete={handleDelete}
        />
      )}

      <div className="mb-4">
        <FilterBadges sessions={viewSessions} />
      </div>

      <PodGrid
        sections={[
          {
            title: `Needs Attention (${grid.attentionItems.length})`,
            items: grid.attentionItems,
            renderItem: (pod) => <PodCard key={pod.leadSessionId} pod={pod} />,
          },
          {
            title: `Working (${grid.workingItems.length})`,
            items: grid.workingItems,
            renderItem: (pod) => <PodCard key={pod.leadSessionId} pod={pod} />,
          },
        ]}
        hasActiveFilters={grid.filteredCount < grid.totalCount}
        totalCount={grid.totalCount}
        filteredEmptyMessage="No pods match the active filters."
        emptyMessage="No pods in this cluster."
      />

      {showEditForm && !isUnclustered && (
        <ClusterForm
          cluster={cluster!}
          onClose={() => setShowEditForm(false)}
        />
      )}
    </ScrollArea>
  );
}
