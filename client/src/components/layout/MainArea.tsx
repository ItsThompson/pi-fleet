import { useNavigationStore } from "@/stores/navigation-store";
import { useSessionStore } from "@/stores/session-store";
import { usePodStore } from "@/stores/pod-store";
import { ClusterView } from "@/components/clusters/ClusterView";
import { PodView } from "@/components/pods/PodView";
import { Layers } from "lucide-react";

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

  if (current.view === "cluster") {
    return <ClusterView clusterId={current.id ?? "unclustered"} clusterName={current.id ? undefined : "All Pods"} />;
  }

  // Default: show all pods as a cluster view
  return <ClusterView clusterId="unclustered" clusterName="All Pods" />;
}
