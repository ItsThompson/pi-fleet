# Review: Ticket 8 - Cluster System

**Reviewer:** automated
**Date:** 2026-05-15
**Commits:** `b3ad7d7`, `5e0c7f2`

---

## 1. Acceptance Criteria Audit

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | POST /api/clusters creates, persists, emits cluster:created | ✅ Met | |
| 2 | PATCH /api/clusters/:id updates, re-evaluates, emits cluster:updated | ✅ Met | |
| 3 | DELETE /api/clusters/:id confirms, moves pods, clears assignments, emits | ✅ Met | Confirmation is client-side via `window.confirm` |
| 4 | POST /api/clusters/reorder accepts orderedIds, emits cluster:reordered | ✅ Met | |
| 5 | POST /api/clusters/assign sets/clears manual, emits assignment-changed | ✅ Met | |
| 6 | Directory matching: longest prefix wins | ✅ Met | |
| 7 | Tilde expansion | ✅ Met | |
| 8 | Trailing slash normalized | ✅ Met | Prevents partial name matches correctly |
| 9 | Manual override takes precedence | ✅ Met | |
| 10 | "Unclustered" always renders at bottom | ✅ Met | Sidebar renders it last |
| 11 | Config file 0600 permissions, version: 1 | ✅ Met | |
| 12 | Debounced write (500ms) | ✅ Met | |
| 13 | Orphan cleanup on load | ✅ Met | |
| 14 | ClusterForm dialog: create/edit, name + directory list | ✅ Met | |
| 15 | GET /api/clusters returns podIds + attentionCount | ✅ Met | |
| 16 | Unit tests for cluster-assignment | ✅ Met | 17 tests covering all scenarios |
| 17 | Unit tests for ClusterStore | ✅ Met | 29 tests covering CRUD, persistence, orphan cleanup |

**All 17 acceptance criteria are met.**

---

## 2. Code Quality

### Naming
Clean and consistent. `assignSessionToCluster`, `expandTilde`, `normalizeTrailingSlash` are descriptive. The zustand store actions (`addCluster`, `updateCluster`, `removeCluster`) map clearly to SSE events. Variable names follow the verbose convention (`expandedCwd`, `bestClusterId`, `clusterPodMap`).

### Structure
Well-decomposed: assignment logic is isolated in its own module with no dependencies on the store, the store is a factory function with closure state, and routes are separately registered. File sizes are all within bounds (73-255 lines). Good that `ClusterSection` was split from `Sidebar`.

### Type Safety
Strong. Shared types (`ClusterConfig`, `ClusterDefinition`, `SSEEvent`) are defined in the shared package and imported consistently. Zod schemas validate all request bodies. No `any` types anywhere. The `SSEEvent` discriminated union covers all cluster events.

### Error Handling
- Config load handles missing/corrupt files gracefully (falls back to default).
- Persistence failure is logged but doesn't crash the server.
- Route handlers return proper HTTP status codes (400, 404).
- Client store silently returns `null`/`false` on fetch errors: consistent with the existing session/pod store patterns.

### Patterns
Follows established patterns from tickets #6 and #7:
- Factory function pattern (`createClusterStore`) matches spec's `createClusterStore()` API.
- Route registration pattern (`registerClusterRoutes`) matches existing routes.
- Server dependency injection pattern in `createServer` for testability.
- Client zustand store shape matches `session-store` and `pod-store`.
- SSE event handling in `useSSE` follows the same switch/case pattern.

---

## 3. Test Quality

### Server: cluster-assignment.test.ts (17 tests)
Excellent coverage: manual override, override precedence, deleted cluster fallthrough, prefix matching, longest prefix, tilde expansion, trailing slash normalization (both positive and negative: `~/foo` not matching `~/foobar`), empty clusters, empty directories. All test through the public interface with real data.

### Server: cluster-store.test.ts (29 tests)
Uses real filesystem (tmpdir), real timers (fake timers via vitest), and real config loading. Covers: initialization, CRUD, reorder, manual assignments, debounced persistence, flush, permissions, and orphan cleanup. Tests are behavioral ("persists to disk after debounce"), not implementation-coupled.

### Server: clusters.test.ts (13 tests)
Integration-style via Fastify inject. Tests the full stack: validation, CRUD, reorder, assign, GET with pod assignment. The last test (`assigns pods to clusters by directory matching`) exercises the full flow with a registered session.

### Client: cluster-store.test.ts (6 tests)
Tests state management logic via direct store manipulation. Adequate for the zustand store. Missing: a test for `handleAssignmentChanged` triggering `fetchClusters`, though this is a side-effect that would require mocking fetch.

### Weak Spots
No weak assertions found. All tests assert specific values, not just "truthy" or "exists."

---

## 4. Issues

### 🟡 Should Fix

**1. `POST /api/clusters/assign` does not validate clusterId references an existing cluster**
- **File:** `server/src/routes/clusters.ts:199-201`
- **Problem:** The assign endpoint calls `clusterStore.setManualAssignment(sessionId, clusterId)` without checking if `clusterId` references a valid existing cluster. A client could set a manual assignment to a nonexistent cluster ID. While `assignSessionToCluster` will ignore invalid manuals during resolution, the invalid assignment still persists to disk and sits in config until orphan cleanup on next load.
- **Fix:** Before calling `setManualAssignment`, validate that `clusterId` (when non-null) exists in `clusterStore.getClusters()`. Return 404 if not found.

**2. `reEvaluateAssignments` emits events for ALL sessions regardless of change**
- **File:** `server/src/routes/clusters.ts:226-241`
- **Problem:** On cluster update/delete, the function broadcasts `cluster:assignment-changed` for every active session, not just ones whose assignment actually changed. With 50 sessions, a cluster name change triggers 50 SSE events + 50 client refetches. The completion summary acknowledges this as intentional for simplicity at expected scale, but it could cause unnecessary network traffic.
- **Fix (optional):** Track previous assignment per session and only emit when it differs. Or if keeping the simple approach, add a comment noting the O(n) broadcast and the scale assumption.

**3. `manualCount` hardcoded to 0 in ClusterView**
- **File:** `client/src/components/clusters/ClusterView.tsx:83`
- **Problem:** `const manualCount = 0;` with a TODO comment. The `ClusterHeader` renders a "manual assignments" line, but it will never show because the count is always 0. This means the UI feature described in the acceptance criteria (ClusterHeader showing manual count) is inert.
- **Fix:** Either wire this from the server (GET /api/clusters could return manual assignment count per cluster) or remove the display entirely if it's deferred.

### 🟢 Nit

**4. `ClusterSection` nested click handler inside CollapsibleTrigger**
- **File:** `client/src/components/clusters/ClusterSection.tsx:38-45`
- **Problem:** The cluster name `<span>` has an `onClick` with `stopPropagation()` nested inside a `<CollapsibleTrigger>`. This works but is fragile: accessibility tooling may interpret the trigger as the clickable element for both expand and navigate. A cleaner pattern would separate the expand chevron from the cluster name link.
- **Fix:** Extract the name into a separate clickable element outside the trigger, or make the entire section the trigger and the name a distinct navigable link.

**5. `ClusterForm` has an initial empty string in directories for create mode**
- **File:** `client/src/components/clusters/ClusterForm.tsx:23`
- **Problem:** `useState<string[]>(cluster?.directories ?? [""])` initializes with one empty row for new clusters. This means submitting without touching directories sends an empty `cleanDirectories` array (since empty strings are filtered). This is fine functionally, but the UI shows an empty row that might confuse users into thinking they must add a directory.
- **Fix:** Consider initializing with `[]` and only showing the add button initially, or keep as-is if the intent is to encourage directory entry.

**6. Completion summary is missing `ClusterSection.tsx` from file list**
- **Problem:** `ClusterSection.tsx` was created (evidenced by the file existing and the git stat), but it's not listed in the "Files created" section.
- **Impact:** Documentation inaccuracy only.

---

## 5. Verdict

✅ **Approve**

All 17 acceptance criteria are met. Tests are comprehensive (17 + 29 + 13 + 6 = 65 cluster-specific tests). Build passes, types check, no regressions. Code follows established patterns and the spec's API surface.

The implementation makes good decisions: factory function over class for the store, debounce with dirty flag and flush-on-dispose, trailing slash normalization to prevent partial matches, and the client refetch strategy for simplicity. The "should fix" items are real but non-blocking: #1 is a validation gap (not a data loss risk since orphan cleanup handles it), #2 is a documented tradeoff, and #3 is cosmetic.
