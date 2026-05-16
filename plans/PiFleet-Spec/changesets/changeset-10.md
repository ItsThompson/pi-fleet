# Changeset 10: Drag-and-Drop

**Ticket:** #10
**Date:** 2026-05-15
**Status:** Complete

## Summary

Implemented drag-and-drop for two operations in the sidebar: pod reassignment between clusters, and cluster reordering. Uses `@dnd-kit/core` + `@dnd-kit/sortable` with pointer and keyboard sensors.

## Files Changed

### Created

| File | Purpose |
|------|---------|
| `client/src/components/dnd/types.ts` | Discriminated union types for drag data |
| `client/src/components/dnd/DndContext.tsx` | DnD provider with sensors and event handlers |
| `client/src/components/dnd/DraggablePod.tsx` | Draggable wrapper for pod rows |
| `client/src/components/dnd/DroppableCluster.tsx` | Drop zone wrapper with visual feedback |
| `client/src/components/dnd/SortableCluster.tsx` | Sortable wrapper for cluster reordering |
| `client/src/components/dnd/PodDragOverlay.tsx` | Ghost element for dragged pods |
| `client/src/components/dnd/ClusterDragOverlay.tsx` | Ghost element for dragged clusters |
| `client/src/components/dnd/index.ts` | Barrel exports |
| `client/src/components/dnd/DndContext.test.tsx` | Component rendering tests |
| `client/src/components/dnd/DndSidebar.test.tsx` | Sidebar DnD integration tests |
| `client/src/components/dnd/DndApi.test.tsx` | API handler logic tests |

### Modified

| File | Change |
|------|--------|
| `client/package.json` | Added @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities |
| `package-lock.json` | Lockfile updated |
| `client/src/components/layout/Sidebar.tsx` | Wrapped with DndProvider, SortableContext, DroppableCluster, SortableCluster |
| `client/src/components/clusters/ClusterSection.tsx` | Wrapped pod rows with DraggablePod |

## Dependencies Added

- `@dnd-kit/core@6.3.1`
- `@dnd-kit/sortable@10.0.0`
- `@dnd-kit/utilities@3.2.2`

## Architecture

```
Sidebar
└── DndProvider (single context, discriminated drag data)
    ├── SortableContext (cluster IDs only)
    │   └── SortableCluster (per cluster, not unclustered)
    │       └── DroppableCluster (pod drop zone)
    │           └── ClusterSection
    │               └── DraggablePod (per pod row)
    │                   └── PodRow
    └── DroppableCluster (unclustered, not sortable)
        └── ClusterSection
            └── DraggablePod
                └── PodRow
```

## API Calls Wired

| Action | Endpoint | Payload |
|--------|----------|---------|
| Pod dropped on cluster | `POST /api/clusters/assign` | `{ sessionId, clusterId }` |
| Pod dropped on unclustered | `POST /api/clusters/assign` | `{ sessionId, clusterId: null }` |
| Cluster reordered | `POST /api/clusters/reorder` | `{ orderedIds: string[] }` |

## Test Coverage

24 new tests across 3 test files. All 123 tests pass (99 existing + 24 new).

## Review Fixes (iteration 2)

- Added braces to all 7 single-line guard clauses in `DndContext.tsx` (ESLint `curly` rule)
- Fixed `handleDragEnd` deps: changed `[clusters]` → `[handlePodDrop, handleClusterReorder]`
- Reordered callbacks: `handlePodDrop`/`handleClusterReorder` now defined before `handleDragEnd`
- Rewrote `DndApi.test.tsx` to render real `DndProvider` with store spies instead of re-implementing handler logic inline
