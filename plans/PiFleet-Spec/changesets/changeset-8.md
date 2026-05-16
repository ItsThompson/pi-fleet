# Changeset 8: Cluster System

**Ticket:** [08-cluster-system.md](../tickets/08-cluster-system.md)
**Date:** 2026-05-15

## Summary

Implemented cluster CRUD, directory-based auto-assignment, manual overrides, and persistence. This is the complete server + client implementation for the cluster system.

## Files Created

| Path | Purpose |
|------|---------|
| `server/src/cluster-assignment.ts` | Directory matching: tilde expansion, trailing slash normalization, longest prefix wins, manual override precedence |
| `server/src/cluster-assignment.test.ts` | 17 unit tests for assignment logic |
| `server/src/cluster-store.ts` | ClusterStore: CRUD, debounced persistence (500ms), 0600 permissions, orphan cleanup |
| `server/src/cluster-store.test.ts` | 29 unit tests for store operations |
| `server/src/routes/clusters.ts` | Cluster API routes: GET, POST, PATCH, DELETE, reorder, assign |
| `server/src/routes/clusters.test.ts` | 13 route integration tests via Fastify inject |
| `client/src/stores/cluster-store.ts` | Zustand store: CRUD, SSE handlers, server API methods |
| `client/src/stores/cluster-store.test.ts` | 6 client store tests |
| `client/src/components/clusters/ClusterForm.tsx` | Create/edit dialog with name + directory list |
| `client/src/components/clusters/ClusterHeader.tsx` | Cluster detail header with metadata and actions |

## Files Modified

| Path | Change |
|------|--------|
| `server/src/server.ts` | Integrated ClusterStore + cluster routes, dispose on shutdown |
| `server/src/schemas.ts` | Added Zod schemas for cluster requests |
| `client/src/hooks/useSSE.ts` | Added cluster SSE event handlers + refetch on reconnect |
| `client/src/components/layout/Sidebar.tsx` | Renders clusters from store, "Unclustered" at bottom, create button |
| `client/src/components/clusters/ClusterView.tsx` | Uses cluster store for pod filtering, added ClusterHeader |

## Commits

- `b3ad7d7` feat: implement cluster system server-side
- `5e0c7f2` feat: implement cluster system client-side

## Test Coverage

- **cluster-assignment**: manual override, longest prefix, tilde expansion, trailing slash normalization, partial name prevention, empty clusters, empty directories
- **cluster-store**: CRUD, persistence debounce, flush, file permissions, orphan cleanup, reorder, manual assignments
- **cluster routes**: create, update, delete, reorder, assign, list with pod membership, directory-based assignment
- **cluster-store (client)**: setClusters, addCluster, updateCluster, removeCluster (moves pods to unclustered), reorderClusters

## Architecture Notes

- Config path: `~/Library/Application Support/PiFleet/config.json` (uses `getConfigPath()` from shared)
- Cluster IDs: `crypto.randomUUID()`
- Debounce: 500ms with dirty flag, flush on dispose
- Re-evaluation: all sessions re-evaluated on cluster edit/delete, events emitted per session
- Client sync: refetches full `/api/clusters` on assignment-changed events
