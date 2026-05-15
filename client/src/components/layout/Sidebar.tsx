import { useState } from "react";
import { usePodStore } from "@/stores/pod-store";
import { useClusterStore } from "@/stores/cluster-store";
import { ClusterSection } from "@/components/clusters/ClusterSection";
import { ClusterForm } from "@/components/clusters/ClusterForm";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { Pod } from "@pi-fleet/shared";

export function Sidebar() {
  const pods = usePodStore((state) => state.pods);
  const clusters = useClusterStore((state) => state.clusters);
  const unclustered = useClusterStore((state) => state.unclustered);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const allPods = Array.from(pods.values());

  function getPodsForIds(podIds: string[]): Pod[] {
    const podIdSet = new Set(podIds);
    return allPods.filter((pod) => podIdSet.has(pod.leadSessionId));
  }

  function computeAttentionCount(clusterPods: Pod[]): number {
    return clusterPods.reduce((sum, pod) => sum + pod.attentionCount, 0);
  }

  const unclusteredPods = getPodsForIds(unclustered.podIds);
  // Also include pods not in any cluster's podIds list (fallback)
  const assignedPodIds = new Set([
    ...clusters.flatMap((cluster) => cluster.podIds),
    ...unclustered.podIds,
  ]);
  const orphanPods = allPods.filter(
    (pod) => !assignedPodIds.has(pod.leadSessionId),
  );
  const allUnclusteredPods = [...unclusteredPods, ...orphanPods];

  return (
    <aside className="w-56 border-r flex flex-col shrink-0">
      <div className="px-3 py-2 border-b flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Clusters
        </span>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setShowCreateForm(true)}
          title="Create cluster"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <ScrollArea className="flex-1 py-1">
        {clusters.map((cluster) => {
          const clusterPods = getPodsForIds(cluster.podIds);
          return (
            <ClusterSection
              key={cluster.id}
              name={cluster.name}
              clusterId={cluster.id}
              pods={clusterPods}
              attentionCount={computeAttentionCount(clusterPods)}
            />
          );
        })}
        <ClusterSection
          name="Unclustered"
          clusterId={null}
          pods={allUnclusteredPods}
          attentionCount={computeAttentionCount(allUnclusteredPods)}
        />
      </ScrollArea>

      {showCreateForm && (
        <ClusterForm onClose={() => setShowCreateForm(false)} />
      )}
    </aside>
  );
}
