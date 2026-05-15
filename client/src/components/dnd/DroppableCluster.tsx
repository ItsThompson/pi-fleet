import { useDroppable } from "@dnd-kit/core";
import type { DragData } from "./types";
import { cn } from "@/lib/utils";

interface DroppableClusterProps {
  clusterId: string | null;
  children: React.ReactNode;
}

export function DroppableCluster({ clusterId, children }: DroppableClusterProps) {
  const droppableId = clusterId ?? "unclustered";

  const { setNodeRef, isOver, active } = useDroppable({
    id: `cluster-drop-${droppableId}`,
  });

  // Only show drop highlight when a pod is being dragged (not cluster reorder)
  const activeData = active?.data.current as DragData | undefined;
  const isPodDrag = activeData?.type === "pod";
  const isClusterDrag = activeData?.type === "cluster";
  const showHighlight = isOver && isPodDrag;
  // Show no-drop cursor when a cluster is dragged over a pod drop zone
  const showNoDrop = isOver && isClusterDrag;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md transition-all",
        showHighlight && "ring-2 ring-blue-500 bg-blue-500/5",
        showNoDrop && "cursor-no-drop",
      )}
    >
      {children}
    </div>
  );
}
