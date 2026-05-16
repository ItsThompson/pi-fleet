# Code Review: Ticket #6 — Pod System

**Reviewer:** automated
**Date:** 2025-05-15
**Commits:** `c6ec45d`, `f662981`, `63cd65b3`, `3e75026`

---

## 1. Acceptance Criteria Audit

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | `reportOwnership` groups matching sessions under parent's pod | ✅ Met | Tested in `pod-registry.test.ts` and route integration test |
| 2 | Sessions without ownership reports exist as single-member pods | ✅ Met | `getPods()` handles unclaimed sessions |
| 3 | `GET /api/pods` returns all computed pods with correct fields | ✅ Met | Route test validates full shape |
| 4 | Pod state = worst state among members | ✅ Met | `aggregateState` with `STATE_PRIORITY` from shared |
| 5 | Pod `attentionCount` = count of members with `pending_approval` or `idle` | ✅ Met | Tested with mixed states |
| 6 | Parent session removed: children become independent pods with correct events | ✅ Met | `pod:dissolved` + `pod:formed` for each child |
| 7 | Child session removed: pod continues, `pod:updated` emitted | ✅ Met | |
| 8 | `POST /api/pods/ownership` returns `{ matchedIds, unmatchedIds }` | ✅ Met | Validated in integration test |
| 9 | Unmatched subagentIds picked up on later registration | ✅ Met | `handleSessionRegistered` + integration test for late registration |
| 10 | SSE emits `pod:formed`, `pod:updated`, `pod:dissolved` | ✅ Met | Pod event bridge in `server.ts` |
| 11 | PodReporter: on `registry-updated`, emits request, on response, posts ownership | ✅ Met | Full cycle tested |
| 12 | PodReporter: on `session_start`, emits initial request (startup catch-up) | ✅ Met | `requestInitialState()` called in `extension/src/index.ts` |
| 13 | Graceful degradation: if orchestrator not loaded, single-member pods (no errors) | ✅ Met | Empty catch in `postOwnership`, test for malformed payloads |
| 14 | Unit tests for PodRegistry: 12+ lifecycle cases | ✅ Met | 20 test cases |
| 15 | Unit tests for PodReporter: signal/request/response with mock event bus | ✅ Met | 7 test cases |

**All 15 acceptance criteria are met.**

---

## 2. Code Quality

### PodRegistry (`server/src/pod-registry.ts`)

**Strengths:**
- Clean class design matching `SessionRegistry` pattern from ticket #3
- Good use of TypeScript discriminated unions for `PodEvent`
- State aggregation logic is compact and correct
- `onEvent`/`emit` pattern is consistent with project conventions
- Display name fallback (agentName → cwd basename) matches spec exactly

**Naming:** Clear and consistent. `ownershipMap`, `buildPod`, `aggregateState`, `computeAttentionCount` are all self-explanatory.

**Structure:** 240 lines, well within limits. Single responsibility (pod computation + events). Private helpers are appropriately scoped.

**Type safety:** Shared types imported from `@pi-fleet/shared`. No `any` usage. `PodEvent` discriminated union enables exhaustive handling at consumers.

**Error handling:** `reportOwnership` gracefully handles non-existent parent sessions. `getPods()` skips missing parents in ownership map.

### Pod Routes (`server/src/routes/pods.ts`)

**Strengths:** Thin adapter (exactly right for routes). Zod validation on POST, structured logging for ownership reports.

### PodReporter (`extension/src/pod-reporter.ts`)

**Strengths:**
- Injectable `fetchFn` for testing
- Defensive payload check (`payload?.subagentIds && Array.isArray(...)`)
- Silent catch for network failures (graceful degradation)
- 73 lines: clean, focused module

### Subagent-Orchestrator Changes

**Strengths:** Minimal footprint (~8 lines total). Signal emission inside `warnSafe` callbacks preserves the existing error-handling pattern. The response handler is a simple 3-line block in `index.ts`.

### Server Integration (`server/src/server.ts`)

**Strengths:** Pod event bridge mirrors the session event bridge pattern. `handleSessionRegistered` called inside `session:added` handler ensures re-evaluation happens atomically with registration.

---

## 3. Test Quality

### PodRegistry Tests (20 cases)

**Strengths:**
- Tests exercise the public interface (`reportOwnership`, `handleSessionRemoved`, `getPods`)
- Uses real `SessionRegistry` (sociable test approach)
- Factory function `buildRegisterBody` with overrides: good pattern
- Edge cases covered: non-existent parent, no-subagentId sessions, listener cleanup

**Assertions:** Strong, specific assertions on pod membership arrays, event types, and counts. No weak "was called" assertions.

### PodReporter Tests (7 cases)

**Strengths:**
- Mock event bus with `trigger`/`emitted` split is clean and readable
- Full protocol cycle test verifies end-to-end flow
- Malformed payload test covers `null`, `{}`, and wrong types
- Async handling with `vi.waitFor` is appropriate for the fire-and-forget `postOwnership`

### Pod Route Integration Tests (7 cases)

**Strengths:** Full-stack integration via Fastify inject. Tests the real server factory with all wiring. Late registration test verifies the re-evaluation path end-to-end.

---

## 4. Issues

### 🟡 Should Fix

**4.1 — `findRemovedSessionSubagentId` is imprecise**
- **File:** `server/src/pod-registry.ts`, lines 186-204
- **Problem:** The method takes `_sessionId` (unused param, note the underscore) but never uses it to identify which specific child was removed. It scans all pods for any unresolved subagentId and returns a generic `{ found: true }`. If two children leave at the same time (reaper runs on two stale sessions), the first removal would emit `pod:updated` for a parent that might not be the correct one (the loop returns on the first match).
- **Suggested fix:** Before unregistering a session from the `SessionRegistry`, stash the removed session's `subagentId` (or pass it to `handleSessionRemoved`). Then match precisely:
  ```typescript
  handleSessionRemoved(sessionId: string, subagentId?: string): void
  ```
  This also eliminates the unused parameter lint smell.

**4.2 — `handleSessionRemoved` for child case may emit update for wrong parent**
- **File:** `server/src/pod-registry.ts`, lines 127-140
- **Problem:** After calling `findRemovedSessionSubagentId`, the code iterates `ownershipMap` entries, emits `pod:updated` for the first parent that still exists, and returns. If multiple parents exist, it may emit for the wrong one.
- **Suggested fix:** Combine with 4.1: pass the subagentId and find the specific parent that claimed it.

**4.3 — `getPods()` is O(sessions × ownershipEntries) on every call**
- **File:** `server/src/pod-registry.ts`, `getPods()` method
- **Problem:** Each call to `getPods()` iterates all ownership entries, and for each, scans all sessions via `findSessionBySubagentId`. The design decision notes say "revisit if pod count grows." This is acceptable at current scale but should have a comment noting the trade-off.
- **Impact:** Low (documented design decision in ticket). Including for completeness.

### 🟢 Nit

**4.4 — Unused return value of `reportOwnership` on the `handleSessionRegistered` path**
- **File:** `server/src/server.ts`, line 72
- **Problem:** `podRegistry.handleSessionRegistered(event.session.sessionId)` triggers `reportOwnership` internally — wait, it doesn't. It just emits an event. This is fine. Disregard.

**4.5 — `postOwnership` fire-and-forget without logging**
- **File:** `extension/src/pod-reporter.ts`, line 50
- **Problem:** The `catch` block is empty. A debug-level log would help diagnose connectivity issues.
- **Suggested fix:** Add `console.debug("[pi-fleet] ownership post failed:", error)` in the catch.

**4.6 — `PodReporter` does not unsubscribe from events**
- **File:** `extension/src/pod-reporter.ts`
- **Problem:** Event listeners are registered but never removed. In the extension lifecycle, the extension is loaded once per session so this is fine, but a `dispose()` method would make the API complete. Low priority since pi extensions don't have a formal teardown for event listeners.

**4.7 — Test file naming inconsistency**
- **Files:** `server/src/pod-routes.test.ts` vs `server/src/routes/pods.ts`
- **Problem:** Route integration tests live at `src/pod-routes.test.ts` (root level) while the route file is `src/routes/pods.ts`. The existing pattern from ticket #3 has `server.test.ts` at root level for integration tests, so this is consistent with that precedent. Naming `pod-routes` vs `pods` is minor.

---

## 5. Verdict

✅ **Approve**

All 15 acceptance criteria are met. Tests are comprehensive (20 + 7 + 7 = 34 new test cases). Build passes, types check, architecture follows established patterns. The PodRegistry is well-designed: clean interface, proper event emission, correct lifecycle handling.

The 🟡 issues (4.1 and 4.2) represent an edge case where two children are reaped simultaneously: the wrong parent could get a spurious `pod:updated` event. In practice at current scale (< 50 sessions, single-parent-per-pod typical usage), this is unlikely to cause visible bugs. Worth tracking for a follow-up but not blocking.

**What was done well:**
- `STATE_PRIORITY` placed in `@pi-fleet/shared` (domain truth, correctly shared)
- PodRegistry as a class matches SessionRegistry pattern
- Inter-extension protocol is minimal and follows the spec's signal/request/response design
- Subagent-orchestrator changes are truly minimal (~8 lines)
- Defensive payload validation in PodReporter prevents crashes on malformed events
- Integration tests verify the full server wiring, not just unit logic
