import { useState } from "react";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { usePodStore } from "@/stores/pod-store";
import { useDerivedClusters } from "@/lib/derived-clusters";
import { ClusterSection } from "@/components/clusters/ClusterSection";
import { ClusterForm } from "@/components/clusters/ClusterForm";
import {
	DndProvider,
	DroppableCluster,
	SortableCluster,
} from "@/components/dnd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { Pod } from "@pi-fleet/shared";

export function Sidebar() {
	const pods = usePodStore((state) => state.pods);
	const { clusters, unclustered } = useDerivedClusters();
	const [showCreateForm, setShowCreateForm] = useState(false);

	const allPods = Array.from(pods.values());

	function getPodsForIds(podIds: string[]): Pod[] {
		const podIdSet = new Set(podIds);
		return allPods.filter((pod) => podIdSet.has(pod.leadSessionId));
	}

	const unclusteredPods = getPodsForIds(unclustered.podIds);

	const sortableClusterIds = clusters.map(
		(derived) => `cluster-sort-${derived.definition.id}`,
	);

	return (
		<DndProvider>
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
					<SortableContext
						items={sortableClusterIds}
						strategy={verticalListSortingStrategy}
					>
						{clusters.map((derived) => {
							const clusterPods = getPodsForIds(derived.podIds);
							return (
								<SortableCluster
									key={derived.definition.id}
									clusterId={derived.definition.id}
									name={derived.definition.name}
								>
									<DroppableCluster clusterId={derived.definition.id}>
										<ClusterSection
											name={derived.definition.name}
											clusterId={derived.definition.id}
											pods={clusterPods}
											attentionCount={derived.attentionCount}
										/>
									</DroppableCluster>
								</SortableCluster>
							);
						})}
					</SortableContext>

					<DroppableCluster clusterId={null}>
						<ClusterSection
							name="Unclustered"
							clusterId={null}
							pods={unclusteredPods}
							attentionCount={unclustered.attentionCount}
						/>
					</DroppableCluster>
				</ScrollArea>

				{showCreateForm && (
					<ClusterForm onClose={() => setShowCreateForm(false)} />
				)}
			</aside>
		</DndProvider>
	);
}
