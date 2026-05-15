import { useState } from "react";
import type { ActivityStatus } from "@pi-fleet/shared";
import { usePodStore } from "@/stores/pod-store";
import { useClusterStore } from "@/stores/cluster-store";
import { PodCard } from "@/components/pods/PodCard";
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
  const cluster = useClusterStore((state) =>
    state.clusters.find((c) => c.id === clusterId),
  );
  const deleteCluster = useClusterStore((state) => state.deleteCluster);
  const [showEditForm, setShowEditForm] = useState(false);

  if (!cluster) {
    return (
      <div className="p-4 text-muted-foreground">
        Cluster not found.
      </div>
    );
  }

  const podIdSet = new Set(cluster.podIds);
  const clusterPods = Array.from(pods.values()).filter((pod) =>
    podIdSet.has(pod.leadSessionId),
  );

  const attentionPods = clusterPods.filter((pod) => needsAttention(pod.state));
  const workingPods = clusterPods.filter((pod) => !needsAttention(pod.state));

  // Count manual assignments (approximate from pod count vs directory matches)
  const manualCount = 0; // This would require server-side info; kept for display

  async function handleDelete(): Promise<void> {
    const confirmed = window.confirm(
      `Delete cluster "${cluster!.name}"? Pods will move to Unclustered.`,
    );
    if (!confirmed) return;
    await deleteCluster(cluster!.id);
  }

  return (
    <ScrollArea className="h-full p-4">
      <ClusterHeader
        cluster={cluster}
        manualCount={manualCount}
        onEdit={() => setShowEditForm(true)}
        onDelete={handleDelete}
      />

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

      {clusterPods.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No pods in this cluster.
        </p>
      )}

      {showEditForm && (
        <ClusterForm
          cluster={cluster}
          onClose={() => setShowEditForm(false)}
        />
      )}
    </ScrollArea>
  );
}
