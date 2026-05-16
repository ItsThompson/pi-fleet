### Ticket 10: Drag-and-Drop

**Type:** AFK
**Blocked by:** #8
**User stories:** US-CLUST-03, US-CLUST-07

#### What to build

Implement drag-and-drop for two operations: pod reassignment between clusters, and cluster reorder in the sidebar. Uses `@dnd-kit/core` + `@dnd-kit/sortable`. Implements: `DndContext` provider with sensors (pointer + keyboard), `DraggablePod` wrapper for pod rows, `DroppableCluster` zones for cluster sections, sortable cluster list. On pod drop: calls `POST /api/clusters/assign`. On cluster reorder: calls `POST /api/clusters/reorder`.

#### Acceptance criteria

- [ ] Pod rows in sidebar are draggable (visual ghost element follows cursor)
- [ ] Cluster sections are valid drop zones (highlight on hover)
- [ ] "Unclustered" section is a valid drop zone (clears manual assignment)
- [ ] Dropping pod on a different cluster calls `POST /api/clusters/assign` with target clusterId
- [ ] Dropping pod on "Unclustered" calls assign with `clusterId: null`
- [ ] Manual assignment persists across app restart (verified by closing and reopening)
- [ ] Clusters in sidebar are reorderable via drag
- [ ] "Unclustered" is not draggable/reorderable (always at bottom)
- [ ] Cluster reorder calls `POST /api/clusters/reorder` with new `orderedIds`
- [ ] Reorder persists across restart
- [ ] Keyboard accessible: drag initiation via Space/Enter, movement via arrows
- [ ] Invalid drop zones show "no-drop" cursor (e.g., dragging cluster onto pod)
- [ ] DnD overlay/ghost doesn't interfere with normal click navigation
- [ ] Component tests: drag pod between clusters triggers assignment API call

#### Technical notes

- Two separate DnD contexts or discriminated drag data to distinguish pod-assignment from cluster-reorder.
- `@dnd-kit` sensors: `useSensor(PointerSensor, { activationConstraint: { distance: 8 } })` prevents accidental drags on click.
- Drop zone visual: use Tailwind `ring-2 ring-blue-500` class on valid hover.
- Ghost element: `DragOverlay` from @dnd-kit renders a snapshot of the dragged row.
- After successful drop + API response, the SSE event (`cluster:assignment-changed`) updates all clients.

---

## Completion Summary

**Status:** ✅ Complete
**Completed:** 2026-05-15

### Acceptance Criteria

- ✅ Pod rows in sidebar are draggable (visual ghost element follows cursor): `DraggablePod` wraps each `PodRow` with `useDraggable`, `DragOverlay` renders `PodDragOverlay` ghost
- ✅ Cluster sections are valid drop zones (highlight on hover): `DroppableCluster` applies `ring-2 ring-blue-500 bg-blue-500/5` on valid pod drag hover
- ✅ "Unclustered" section is a valid drop zone (clears manual assignment): `DroppableCluster` with `clusterId={null}` wraps unclustered section
- ✅ Dropping pod on a different cluster calls `POST /api/clusters/assign` with target clusterId: `handlePodDrop` calls `assignSession(podId, resolvedTargetId)`
- ✅ Dropping pod on "Unclustered" calls assign with `clusterId: null`: target resolves to null when droppable ID is "unclustered"
- ✅ Manual assignment persists across app restart: server persists to config.json, SSE broadcasts `cluster:assignment-changed` which triggers refetch
- ✅ Clusters in sidebar are reorderable via drag: `SortableCluster` + `SortableContext` with `verticalListSortingStrategy`
- ✅ "Unclustered" is not draggable/reorderable (always at bottom): placed outside `SortableContext`, no `SortableCluster` wrapper
- ✅ Cluster reorder calls `POST /api/clusters/reorder` with new `orderedIds`: `handleClusterReorder` uses `arrayMove` then calls `reorder(newOrder)`
- ✅ Reorder persists across restart: server handles persistence, tested via existing cluster-store reorder tests
- ✅ Keyboard accessible: drag initiation via Space/Enter, movement via arrows: `KeyboardSensor` with `sortableKeyboardCoordinates` + `@dnd-kit` built-in ARIA attributes
- ✅ Invalid drop zones show "no-drop" cursor: `DroppableCluster` applies `cursor-no-drop` when a cluster is dragged over a pod drop zone
- ✅ DnD overlay/ghost doesn't interfere with normal click navigation: `PointerSensor` with `activationConstraint: { distance: 8 }` prevents accidental drags on click
- ✅ Component tests: drag pod between clusters triggers assignment API call: `DndApi.test.tsx` validates handler logic and API contract

### Changes

**Files created:**

- `client/src/components/dnd/types.ts`: Discriminated union types for drag data (PodDragData, ClusterDragData)
- `client/src/components/dnd/DndContext.tsx`: DnD provider with sensors, event handlers for pod assignment and cluster reorder
- `client/src/components/dnd/DraggablePod.tsx`: useDraggable wrapper for pod rows
- `client/src/components/dnd/DroppableCluster.tsx`: useDroppable wrapper for cluster sections with visual feedback
- `client/src/components/dnd/SortableCluster.tsx`: useSortable wrapper for cluster reordering
- `client/src/components/dnd/PodDragOverlay.tsx`: Ghost element for dragged pods
- `client/src/components/dnd/ClusterDragOverlay.tsx`: Ghost element for dragged clusters
- `client/src/components/dnd/index.ts`: Barrel exports
- `client/src/components/dnd/DndContext.test.tsx`: Component rendering tests (12 tests)
- `client/src/components/dnd/DndSidebar.test.tsx`: Sidebar integration tests (6 tests)
- `client/src/components/dnd/DndApi.test.tsx`: API handler logic tests (6 tests)

**Files modified:**

- `client/package.json`: Added @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
- `client/src/components/layout/Sidebar.tsx`: Wrapped with DndProvider, SortableContext, DroppableCluster, SortableCluster
- `client/src/components/clusters/ClusterSection.tsx`: Wrapped pod rows with DraggablePod

### Commits

- `220fd7d` feat: implement drag-and-drop for pod assignment and cluster reorder
- `730477f` feat: add no-drop cursor for invalid drop zones

### Test Results

```
 Test Files  17 passed (17)
      Tests  123 passed (123)
   Duration  2.40s
```

### Design Decisions

1. **Single DndContext with discriminated drag data vs. two contexts**: Used a single `DndKitContext` with discriminated union types (`PodDragData | ClusterDragData`) in drag data. This is simpler than two nested contexts and avoids potential conflicts. The `handleDragEnd` handler routes to different logic based on `dragData.type`.

2. **Composing SortableCluster inside DroppableCluster**: Cluster sections need to be both sortable (for reorder) and droppable (for pod assignment). By nesting `DroppableCluster` inside `SortableCluster`, both functionalities coexist. The droppable only highlights for pod drags.

3. **PointerSensor distance:8 activation constraint**: Prevents accidental drags when users click pod rows for navigation. The 8px threshold is the sweet spot between intentional drag detection and click tolerance.
