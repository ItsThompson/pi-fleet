/** Discriminated drag data for distinguishing pod-assignment from cluster-reorder */

import { UNCLUSTERED_ID } from "@pi-fleet/shared";

export { UNCLUSTERED_ID };

export interface PodDragData {
	type: "pod";
	podId: string;
	displayName: string;
	sourceClusterId: string | null;
}

export interface ClusterDragData {
	type: "cluster";
	clusterId: string;
	name: string;
}

export type DragData = PodDragData | ClusterDragData;
