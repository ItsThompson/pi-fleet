import { useNavigationStore } from "@/stores/navigation-store";
import { useSessionStore } from "@/stores/session-store";
import { usePodStore } from "@/stores/pod-store";
import { ClusterView } from "@/components/clusters/ClusterView";
import { PodView } from "@/components/pods/PodView";
import { AllPodsView } from "@/components/pods/AllPodsView";
import { EmptyState } from "@/components/layout/EmptyState";

export function MainArea() {
  const { current } = useNavigationStore();
  const sessions = useSessionStore((state) => state.sessions);
  const pods = usePodStore((state) => state.pods);

  if (sessions.size === 0) return <EmptyState />;

  if (current.view === "pod" && current.id) {
    const pod = pods.get(current.id);
    if (pod) return <PodView pod={pod} />;
  }

  if (current.view === "cluster" && current.id) {
    return <ClusterView clusterId={current.id} />;
  }

  return <AllPodsView />;
}
