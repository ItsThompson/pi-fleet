### Ticket 8: Cluster System

**Type:** AFK
**Blocked by:** #6, #7
**User stories:** US-CLUST-01, US-CLUST-02, US-CLUST-03, US-CLUST-04, US-CLUST-05, US-CLUST-06, US-CLUST-07

#### What to build

Implement cluster CRUD, directory-based auto-assignment, manual overrides, and persistence. Server side: `ClusterStore` (read/write `config.json`), `cluster-assignment` (directory matching + manual override logic), cluster routes (GET/POST/PATCH/DELETE/reorder/assign). Client side: `cluster-store` (zustand, CRUD operations, SSE sync), `ClusterForm` (create/edit dialog), `ClusterHeader` (detail view header with directories and manual count), sidebar cluster section with context menus. Config persists in `~/Library/Application Support/PiFleet/config.json`.

#### Acceptance criteria

- [ ] `POST /api/clusters` creates cluster with name + optional directories, persists to disk, emits `cluster:created`
- [ ] `PATCH /api/clusters/:id` updates name/directories, re-evaluates assignments, emits `cluster:updated`
- [ ] `DELETE /api/clusters/:id` shows confirmation, moves pods to unclustered, clears manual assignments, emits `cluster:deleted`
- [ ] `POST /api/clusters/reorder` accepts `orderedIds`, updates sortOrder, emits `cluster:reordered`
- [ ] `POST /api/clusters/assign` sets/clears manual assignment, emits `cluster:assignment-changed`
- [ ] Directory matching: session's cwd matched against cluster directories; longest prefix wins
- [ ] Tilde expansion: `~` in directory configs resolves to `os.homedir()`
- [ ] Trailing slash normalized before prefix comparison
- [ ] Manual override takes precedence over directory match
- [ ] "Unclustered" section always renders at bottom with unmatched pods
- [ ] Config file created with 0600 permissions; includes `version: 1` field
- [ ] Config write is debounced (500ms) to avoid disk thrash on rapid changes
- [ ] Orphan cleanup: manual assignments to deleted clusters are cleared on load
- [ ] `ClusterForm` dialog for create/edit: name (required) + directory list (add/remove rows)
- [ ] `GET /api/clusters` returns clusters with `podIds` and `attentionCount` per cluster
- [ ] Unit tests for `cluster-assignment`: manual override, longest prefix, tilde, trailing slash, no-match
- [ ] Unit tests for `ClusterStore`: CRUD operations, persistence, reorder, orphan cleanup

#### Technical notes

- Config path: `~/Library/Application Support/PiFleet/config.json`. Use `app.getPath('userData')` in Electron or hardcode with `os.homedir()` in server.
- Cluster IDs: use `crypto.randomUUID()`.
- Debounced write: track dirty flag + setTimeout. Clear on shutdown to ensure final state is persisted.
- `GET /api/clusters` computes `podIds` by running assignment logic for all active sessions.
- Re-evaluation on cluster edit: iterate all sessions, recompute assignment, emit events for any that changed.

---

## Completion Summary

**Status:** ✅ Complete
**Completed:** 2026-05-15

### Acceptance Criteria

- ✅ `POST /api/clusters` creates cluster with name + optional directories, persists to disk, emits `cluster:created`
- ✅ `PATCH /api/clusters/:id` updates name/directories, re-evaluates assignments, emits `cluster:updated`
- ✅ `DELETE /api/clusters/:id` shows confirmation, moves pods to unclustered, clears manual assignments, emits `cluster:deleted`
- ✅ `POST /api/clusters/reorder` accepts `orderedIds`, updates sortOrder, emits `cluster:reordered`
- ✅ `POST /api/clusters/assign` sets/clears manual assignment, emits `cluster:assignment-changed`
- ✅ Directory matching: session's cwd matched against cluster directories; longest prefix wins
- ✅ Tilde expansion: `~` in directory configs resolves to `os.homedir()`
- ✅ Trailing slash normalized before prefix comparison
- ✅ Manual override takes precedence over directory match
- ✅ "Unclustered" section always renders at bottom with unmatched pods
- ✅ Config file created with 0600 permissions; includes `version: 1` field
- ✅ Config write is debounced (500ms) to avoid disk thrash on rapid changes
- ✅ Orphan cleanup: manual assignments to deleted clusters are cleared on load
- ✅ `ClusterForm` dialog for create/edit: name (required) + directory list (add/remove rows)
- ✅ `GET /api/clusters` returns clusters with `podIds` and `attentionCount` per cluster
- ✅ Unit tests for `cluster-assignment`: manual override, longest prefix, tilde, trailing slash, no-match
- ✅ Unit tests for `ClusterStore`: CRUD operations, persistence, reorder, orphan cleanup

### Changes

**Files created:**
- `server/src/cluster-assignment.ts`: Directory matching logic with tilde expansion, trailing slash normalization, manual override precedence
- `server/src/cluster-assignment.test.ts`: 17 unit tests covering all assignment scenarios
- `server/src/cluster-store.ts`: Cluster persistence with CRUD, debounced writes, orphan cleanup, 0600 permissions
- `server/src/cluster-store.test.ts`: 29 unit tests covering CRUD, persistence, reorder, orphan cleanup
- `server/src/routes/clusters.ts`: All cluster API endpoints (GET, POST, PATCH, DELETE, reorder, assign)
- `server/src/routes/clusters.test.ts`: 13 integration tests via Fastify inject
- `client/src/stores/cluster-store.ts`: Zustand store with CRUD operations, SSE event handlers, server fetch
- `client/src/stores/cluster-store.test.ts`: 6 unit tests for state management
- `client/src/components/clusters/ClusterForm.tsx`: Create/edit dialog with name + directory list (add/remove rows)
- `client/src/components/clusters/ClusterHeader.tsx`: Cluster detail header with directories, manual count, edit/delete buttons

**Files modified:**
- `server/src/server.ts`: Integrated ClusterStore into server factory, added cluster routes, dispose on shutdown
- `server/src/schemas.ts`: Added Zod schemas for cluster API requests (create, update, reorder, assign)
- `client/src/hooks/useSSE.ts`: Added cluster SSE event handlers and cluster refetch on reconnect
- `client/src/components/layout/Sidebar.tsx`: Renders clusters from store with create button, "Unclustered" always at bottom
- `client/src/components/clusters/ClusterView.tsx`: Uses cluster store for pod filtering, integrated ClusterHeader

### Commits

- `b3ad7d7` feat: implement cluster system server-side
- `5e0c7f2` feat: implement cluster system client-side

### Test Results

Server (150 tests, 11 files):
```
 Test Files  11 passed (11)
      Tests  150 passed (150)
   Duration  732ms
```

Client (80 tests, 12 files):
```
 Test Files  12 passed (12)
      Tests  80 passed (80)
   Duration  1.55s
```

Typecheck: `tsc --noEmit` passes in both server and client packages.

### Design Decisions

1. **Factory function for ClusterStore (not class):** Matches the pattern from the spec's `createClusterStore()` API. Uses closure for internal state rather than class fields, making the store interface explicit and preventing direct state mutation.

2. **Debounce implementation with dirty flag:** Only one timer is active at a time. `schedulePersist()` sets the dirty flag and starts a 500ms timer. `flush()` clears the timer and writes immediately if dirty. `dispose()` calls `flush()` to ensure final state is persisted on shutdown.

3. **Re-evaluation broadcasts for all sessions on cluster edit/delete:** Rather than tracking previous assignments and diffing, we re-evaluate all sessions and emit `cluster:assignment-changed` for each. With expected scale (<50 sessions) this is simpler and ensures clients are always in sync. The client refetches full cluster state on assignment-changed events.

4. **Client-side refetch on assignment-changed:** Rather than tracking pod-to-session-to-cluster mapping on the client, the cluster store refetches the full `/api/clusters` response on assignment changes. This keeps the client simple and ensures consistency with server state.
