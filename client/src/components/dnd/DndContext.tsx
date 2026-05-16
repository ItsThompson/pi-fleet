import { useState, useCallback } from "react";
import {
  DndContext as DndKitContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useClusterStore } from "@/stores/cluster-store";
import { usePodStore } from "@/stores/pod-store";
import { PodDragOverlay } from "./PodDragOverlay";
import { ClusterDragOverlay } from "./ClusterDragOverlay";
import { UNCLUSTERED_ID, type DragData, type PodDragData, type ClusterDragData } from "./types";

interface DndProviderProps {
  children: React.ReactNode;
}

export function DndProvider({ children }: DndProviderProps) {
  const [activeData, setActiveData] = useState<DragData | null>(null);
  const assignSession = useClusterStore((state) => state.assignSession);
  const reorder = useClusterStore((state) => state.reorder);
  const clusters = useClusterStore((state) => state.clusters);
  const pods = usePodStore((state) => state.pods);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  const sensors = useSensors(pointerSensor, keyboardSensor);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (data) {
      setActiveData(data);
    }
  }, []);

  const handlePodDrop = useCallback(
    (podData: PodDragData, overId: string) => {
      // overId format: "cluster-drop-{clusterId}" or "cluster-drop-unclustered"
      if (!overId.startsWith("cluster-drop-")) {
        return;
      }

      const targetClusterId = overId.replace("cluster-drop-", "");
      const resolvedTargetId = targetClusterId === UNCLUSTERED_ID ? null : targetClusterId;

      // Skip if dropping on same cluster
      if (resolvedTargetId === podData.sourceClusterId) {
        return;
      }

      // The pod's leadSessionId is the sessionId for assignment
      assignSession(podData.podId, resolvedTargetId);
    },
    [assignSession],
  );

  const handleClusterReorder = useCallback(
    (activeId: string, overId: string) => {
      // Both IDs are "cluster-sort-{clusterId}"
      if (!activeId.startsWith("cluster-sort-") || !overId.startsWith("cluster-sort-")) {
        return;
      }

      const activeClusterId = activeId.replace("cluster-sort-", "");
      const overClusterId = overId.replace("cluster-sort-", "");

      if (activeClusterId === overClusterId) {
        return;
      }

      const currentIds = clusters.map((cluster) => cluster.id);
      const oldIndex = currentIds.indexOf(activeClusterId);
      const newIndex = currentIds.indexOf(overClusterId);

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      const newOrder = arrayMove(currentIds, oldIndex, newIndex);
      reorder(newOrder);
    },
    [clusters, reorder],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveData(null);

      if (!over) {
        return;
      }

      const dragData = active.data.current as DragData | undefined;
      if (!dragData) {
        return;
      }

      if (dragData.type === "pod") {
        handlePodDrop(dragData, over.id as string);
      } else if (dragData.type === "cluster") {
        handleClusterReorder(active.id as string, over.id as string);
      }
    },
    [handlePodDrop, handleClusterReorder],
  );

  const activePod = activeData?.type === "pod"
    ? pods.get(activeData.podId) ?? null
    : null;

  return (
    <DndKitContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {activeData?.type === "pod" && activePod && (
          <PodDragOverlay pod={activePod} />
        )}
        {activeData?.type === "cluster" && (
          <ClusterDragOverlay name={(activeData as ClusterDragData).name} />
        )}
      </DragOverlay>
    </DndKitContext>
  );
}
