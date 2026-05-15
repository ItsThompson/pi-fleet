/** Discriminated drag data for distinguishing pod-assignment from cluster-reorder */

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

export const UNCLUSTERED_ID = "unclustered";
