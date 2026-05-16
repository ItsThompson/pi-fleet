import { useState } from "react";
import type { RegisteredSession } from "@pi-fleet/shared";
import { UNCLUSTERED_ID } from "@pi-fleet/shared";
import { usePodStore } from "@/stores/pod-store";
import { useSessionStore } from "@/stores/session-store";
import {
	useDerivedCluster,
	useDerivedUnclustered,
} from "@/lib/derived-clusters";
import { useFilteredPods } from "@/hooks/useFilteredPodGrid";
import { PodGrid } from "@/components/shared/PodGrid";
import { PodCard } from "@/components/pods/PodCard";
import { FilterBadges } from "@/components/attention/FilterBadges";
import { ClusterHeader } from "@/components/clusters/ClusterHeader";
import { ClusterForm } from "@/components/clusters/ClusterForm";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getServerUrl } from "@/lib/bridge";
import { deleteCluster } from "@/api/cluster-api";

interface ClusterViewProps {
	clusterId: string;
}

export function ClusterView({ clusterId }: ClusterViewProps) {
	const pods = usePodStore((state) => state.pods);
	const sessions = useSessionStore((state) => state.sessions);
	const derivedCluster = useDerivedCluster(clusterId);
	const derivedUnclustered = useDerivedUnclustered();
	const [showEditForm, setShowEditForm] = useState(false);

	const isUnclustered = clusterId === UNCLUSTERED_ID;

	if (!isUnclustered && !derivedCluster) {
		return <div className="p-4 text-muted-foreground">Cluster not found.</div>;
	}

	// Determine which pod IDs belong to this view
	const allPods = Array.from(pods.values());
	const podIdSet = isUnclustered
		? new Set(derivedUnclustered.podIds)
		: new Set(derivedCluster!.podIds);

	const clusterPods = allPods.filter((pod) => podIdSet.has(pod.leadSessionId));

	// Use shared hook for filtering and attention/working split
	const grid = useFilteredPods(clusterPods);

	// Compute all sessions in this cluster's pods for filter badge counts
	const viewSessions = clusterPods.reduce<RegisteredSession[]>((acc, pod) => {
		pod.memberSessionIds.forEach((id) => {
			const session = sessions.get(id);
			if (session) {
				acc.push(session);
			}
		});
		return acc;
	}, []);

	// Count manual assignments (approximate from pod count vs directory matches)
	const manualCount = 0; // This would require server-side info; kept for display

	async function handleDelete(): Promise<void> {
		if (isUnclustered) {
			return;
		}
		const confirmed = window.confirm(
			`Delete cluster "${derivedCluster!.definition.name}"? Pods will move to Unclustered.`,
		);
		if (!confirmed) {
			return;
		}
		const result = await deleteCluster(
			getServerUrl(),
			derivedCluster!.definition.id,
		);
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
					cluster={derivedCluster!}
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
					cluster={derivedCluster!.definition}
					onClose={() => setShowEditForm(false)}
				/>
			)}
		</ScrollArea>
	);
}
