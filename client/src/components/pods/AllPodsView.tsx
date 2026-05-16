import type { RegisteredSession } from "@pi-fleet/shared";
import { usePodStore } from "@/stores/pod-store";
import { useSessionStore } from "@/stores/session-store";
import { useFilteredPods } from "@/hooks/useFilteredPodGrid";
import { PodGrid } from "@/components/shared/PodGrid";
import { PodCard } from "@/components/pods/PodCard";
import { FilterBadges } from "@/components/attention/FilterBadges";
import { ScrollArea } from "@/components/ui/scroll-area";

/** Default view showing all pods when no specific cluster is selected */
export function AllPodsView() {
	const pods = usePodStore((state) => state.pods);
	const sessions = useSessionStore((state) => state.sessions);
	const allPods = Array.from(pods.values());
	const grid = useFilteredPods(allPods);

	// Derive sessions for filter badge counts
	const viewSessions = allPods.reduce<RegisteredSession[]>((acc, pod) => {
		pod.memberSessionIds.forEach((id) => {
			const session = sessions.get(id);
			if (session) {
				acc.push(session);
			}
		});
		return acc;
	}, []);

	return (
		<ScrollArea className="h-full p-4">
			<h2 className="text-lg font-semibold mb-2">All Pods</h2>
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
		</ScrollArea>
	);
}
