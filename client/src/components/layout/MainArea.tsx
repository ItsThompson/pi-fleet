import { useNavigationStore } from "@/stores/navigation-store";
import { useSessionStore } from "@/stores/session-store";
import { usePodStore } from "@/stores/pod-store";
import { useFilterStore } from "@/stores/filter-store";
import { ClusterView } from "@/components/clusters/ClusterView";
import { PodView } from "@/components/pods/PodView";
import { PodCard } from "@/components/pods/PodCard";
import { FilterBadges } from "@/components/attention/FilterBadges";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Layers } from "lucide-react";
import type { RegisteredSession } from "@pi-fleet/shared";

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <Layers className="h-12 w-12 text-muted-foreground/50 mb-4" />
      <h2 className="text-lg font-semibold mb-2">No active sessions</h2>
      <p className="text-sm text-muted-foreground max-w-md">
        Sessions will appear here when pi is running with the pi-fleet extension installed.
        Start a pi session in your terminal to get started.
      </p>
      <p className="text-xs text-muted-foreground mt-4 max-w-md">
        Install the extension by symlinking it into{" "}
        <code className="bg-secondary px-1 py-0.5 rounded">~/.pi/agent/extensions/pi-fleet</code>
      </p>
    </div>
  );
}

/** Default view showing all pods when no specific cluster is selected */
function AllPodsView() {
  const pods = usePodStore((state) => state.pods);
  const sessions = useSessionStore((state) => state.sessions);
  const podPassesFilter = useFilterStore((state) => state.podPassesFilter);
  const activeFilters = useFilterStore((state) => state.activeFilters);

  const allPods = Array.from(pods.values());

  const viewSessions = allPods.reduce<RegisteredSession[]>((acc, pod) => {
    pod.memberSessionIds.forEach((id) => {
      const session = sessions.get(id);
      if (session) acc.push(session);
    });
    return acc;
  }, []);

  const filteredPods = activeFilters.size > 0
    ? allPods.filter((pod) => podPassesFilter(pod, sessions))
    : allPods;

  const attentionPods = filteredPods.filter(
    (pod) => pod.state === "pending_approval" || pod.state === "idle",
  );
  const workingPods = filteredPods.filter(
    (pod) => pod.state !== "pending_approval" && pod.state !== "idle",
  );

  return (
    <ScrollArea className="h-full p-4">
      <h2 className="text-lg font-semibold mb-2">All Pods</h2>

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

      {filteredPods.length === 0 && allPods.length > 0 && (
        <p className="text-sm text-muted-foreground">No pods match the active filters.</p>
      )}
    </ScrollArea>
  );
}

export function MainArea() {
  const { current } = useNavigationStore();
  const sessions = useSessionStore((state) => state.sessions);
  const pods = usePodStore((state) => state.pods);

  // Empty state: no sessions at all
  if (sessions.size === 0) {
    return <EmptyState />;
  }

  if (current.view === "pod" && current.id) {
    const pod = pods.get(current.id);
    if (pod) {
      return <PodView pod={pod} />;
    }
  }

  if (current.view === "cluster" && current.id) {
    return <ClusterView clusterId={current.id} />;
  }

  // Default: show all pods
  return <AllPodsView />;
}
