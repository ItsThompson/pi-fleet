import { usePodStore } from "@/stores/pod-store";
import { useSessionStore } from "@/stores/session-store";
import { ClusterSection } from "@/components/clusters/ClusterSection";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Pod, ActivityStatus } from "@pi-fleet/shared";

function computeAttentionCount(pods: Pod[], sessions: Map<string, unknown>): number {
  return pods.reduce((sum, pod) => sum + pod.attentionCount, 0);
}

export function Sidebar() {
  const pods = usePodStore((state) => state.pods);
  const sessions = useSessionStore((state) => state.sessions);

  const allPods = Array.from(pods.values());

  // For this ticket, cluster assignment is not yet implemented.
  // All pods appear under "Unclustered" for now.
  const unclusteredPods = allPods;
  const unclusteredAttention = computeAttentionCount(unclusteredPods, sessions);

  return (
    <aside className="w-56 border-r flex flex-col shrink-0">
      <div className="px-3 py-2 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Clusters
        </span>
      </div>
      <ScrollArea className="flex-1 py-1">
        <ClusterSection
          name="Unclustered"
          clusterId={null}
          pods={unclusteredPods}
          attentionCount={unclusteredAttention}
        />
      </ScrollArea>
    </aside>
  );
}
