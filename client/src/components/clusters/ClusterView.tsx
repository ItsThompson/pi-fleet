import type { Pod, ActivityStatus } from "@pi-fleet/shared";
import { usePodStore } from "@/stores/pod-store";
import { PodCard } from "@/components/pods/PodCard";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ClusterViewProps {
  clusterId: string;
  clusterName?: string;
}

function needsAttention(state: ActivityStatus): boolean {
  return state === "pending_approval" || state === "idle";
}

export function ClusterView({ clusterId, clusterName }: ClusterViewProps) {
  const pods = usePodStore((state) => state.pods);

  // For now, show all pods (cluster assignment filtering is a future ticket)
  const allPods = Array.from(pods.values());

  const attentionPods = allPods.filter((pod) => needsAttention(pod.state));
  const workingPods = allPods.filter((pod) => !needsAttention(pod.state));

  return (
    <ScrollArea className="h-full p-4">
      <h2 className="text-lg font-semibold mb-4">{clusterName ?? "Cluster"}</h2>

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

      {allPods.length === 0 && (
        <p className="text-sm text-muted-foreground">No pods in this cluster.</p>
      )}
    </ScrollArea>
  );
}
