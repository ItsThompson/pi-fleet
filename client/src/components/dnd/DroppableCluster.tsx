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
  const showHighlight = isOver && isPodDrag;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md transition-all",
        showHighlight && "ring-2 ring-blue-500 bg-blue-500/5",
      )}
    >
      {children}
    </div>
  );
}
