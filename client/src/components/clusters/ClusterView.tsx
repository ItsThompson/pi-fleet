import { useState } from "react";
import type { ActivityStatus, RegisteredSession } from "@pi-fleet/shared";
import { usePodStore } from "@/stores/pod-store";
import { useSessionStore } from "@/stores/session-store";
import { useClusterStore } from "@/stores/cluster-store";
import { useFilterStore } from "@/stores/filter-store";
import { PodCard } from "@/components/pods/PodCard";
import { FilterBadges } from "@/components/attention/FilterBadges";
import { ClusterHeader } from "@/components/clusters/ClusterHeader";
import { ClusterForm } from "@/components/clusters/ClusterForm";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ClusterViewProps {
  clusterId: string;
}

function needsAttention(state: ActivityStatus): boolean {
  return state === "pending_approval" || state === "idle";
}

export function ClusterView({ clusterId }: ClusterViewProps) {
  const pods = usePodStore((state) => state.pods);
  const sessions = useSessionStore((state) => state.sessions);
  const cluster = useClusterStore((state) =>
    state.clusters.find((c) => c.id === clusterId),
  );
  const unclustered = useClusterStore((state) => state.unclustered);
  const deleteCluster = useClusterStore((state) => state.deleteCluster);
  const podPassesFilter = useFilterStore((state) => state.podPassesFilter);
  const activeFilters = useFilterStore((state) => state.activeFilters);
  const [showEditForm, setShowEditForm] = useState(false);

  const isUnclustered = clusterId === "unclustered";

  if (!isUnclustered && !cluster) {
    return (
      <div className="p-4 text-muted-foreground">
        Cluster not found.
      </div>
    );
  }

  // For unclustered: include both server-assigned unclustered pods AND orphans
  // (pods not referenced by any cluster or the unclustered list)
  const allPods = Array.from(pods.values());
  let podIdSet: Set<string>;
  if (isUnclustered) {
    const clusters = useClusterStore.getState().clusters;
    const assignedPodIds = new Set([
      ...clusters.flatMap((c) => c.podIds),
      ...unclustered.podIds,
    ]);
    const orphanIds = allPods
      .filter((pod) => !assignedPodIds.has(pod.leadSessionId))
      .map((pod) => pod.leadSessionId);
    podIdSet = new Set([...unclustered.podIds, ...orphanIds]);
  } else {
    podIdSet = new Set(cluster!.podIds);
  }
  const clusterPods = Array.from(pods.values()).filter((pod) =>
    podIdSet.has(pod.leadSessionId),
  );

  // Compute all sessions in this cluster's pods for filter badge counts
  const viewSessions = clusterPods.reduce<RegisteredSession[]>((acc, pod) => {
    pod.memberSessionIds.forEach((id) => {
      const session = sessions.get(id);
      if (session) acc.push(session);
    });
    return acc;
  }, []);

  // Apply filters
  const filteredPods = activeFilters.size > 0
    ? clusterPods.filter((pod) => podPassesFilter(pod, sessions))
    : clusterPods;

  const attentionPods = filteredPods.filter((pod) => needsAttention(pod.state));
  const workingPods = filteredPods.filter((pod) => !needsAttention(pod.state));

  // Count manual assignments (approximate from pod count vs directory matches)
  const manualCount = 0; // This would require server-side info; kept for display

  async function handleDelete(): Promise<void> {
    if (isUnclustered) return;
    const confirmed = window.confirm(
      `Delete cluster "${cluster!.name}"? Pods will move to Unclustered.`,
    );
    if (!confirmed) return;
    await deleteCluster(cluster!.id);
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

      {attentionPods.length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Needs Attention ({attentionPods.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {attentionPods.map((pod) => (
              <PodCard key={pod.leadSessionId} pod={pod} />
            ))}
          </div>
        </section>
      )}

      {workingPods.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Working ({workingPods.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {workingPods.map((pod) => (
              <PodCard key={pod.leadSessionId} pod={pod} />
            ))}
          </div>
        </section>
      )}

      {filteredPods.length === 0 && clusterPods.length > 0 && (
        <p className="text-sm text-muted-foreground">
          No pods match the active filters.
        </p>
      )}

      {clusterPods.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No pods in this cluster.
        </p>
      )}

      {showEditForm && !isUnclustered && (
        <ClusterForm
          cluster={cluster!}
          onClose={() => setShowEditForm(false)}
        />
      )}
    </ScrollArea>
  );
}
