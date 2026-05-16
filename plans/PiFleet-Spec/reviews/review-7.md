# Review: Ticket 7 - Client Shell: Sidebar + Session Cards + SSE Hook

**Reviewer:** automated
**Date:** 2026-05-15
**Verdict:** ✅ Approve

---

## 1. Acceptance Criteria Audit

| Criterion                                                                                           | Status | Notes                                                                  |
| --------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| `useSSE` connects to `GET /api/events`, processes events, exponential backoff (1s, 2s, 4s, max 30s) | ✅ Met | Tested with mock EventSource                                           |
| "Reconnecting..." banner on disconnect, disappears on reconnect                                     | ✅ Met | Header component renders yellow banner                                 |
| On reconnect: full state refetch from `GET /api/sessions` + `GET /api/pods`                         | ✅ Met | `refetchState` called on `connected` event                             |
| Session data NOT cleared during reconnection                                                        | ✅ Met | Explicit test verifies this                                            |
| `session-store` adds/updates/removes reactively                                                     | ✅ Met | All three methods tested                                               |
| `pod-store` derives from SSE events                                                                 | ✅ Met | pod:formed, pod:updated, pod:dissolved handled                         |
| Sidebar renders cluster sections with chevron-expandable pod lists                                  | ✅ Met | Collapsible component with rotate-90 chevron                           |
| Clicking cluster name shows ClusterView                                                             | ✅ Met | Navigation wired through `navigateTo`                                  |
| Clicking pod shows PodView                                                                          | ✅ Met | Tested in Sidebar.test.tsx                                             |
| SessionCard displays all fields                                                                     | ✅ Met | All 11 fields verified in tests                                        |
| SessionStatusDot colors match spec                                                                  | ✅ Met | processing=blue, running_tool=green, idle=yellow, pending_approval=red |
| Subagent "sub" badge; lead "lead" label                                                             | ✅ Met | Tested in PodView.test.tsx                                             |
| Cards grouped into "Needs Attention" and "Working" with counts                                      | ✅ Met | PodView and ClusterView both implement grouping                        |
| Empty state with explanatory message + setup hint                                                   | ✅ Met | EmptyState in MainArea                                                 |
| "Open in terminal" calls `window.piFleet.openSession(sessionId)`                                    | ✅ Met | Tested in SessionCard.test.tsx                                         |
| Component tests for SessionCard, Sidebar, state grouping                                            | ✅ Met | 7 test files, 46 tests                                                 |

---

## 2. Code Quality

### What's done well

- **Store design:** Clean zustand stores using `getState()` for SSE dispatch, avoiding stale closures and React render cycles. The decision to dispatch outside of React is well-reasoned.
- **Type safety:** Proper use of shared types from `@pi-fleet/shared`. All components use typed props with no `any` leaks.
- **activityChangedAt tracking:** Client-side timestamp for future notification ordering is a smart forward-looking addition.
- **Separation of concerns:** Stores, hooks, and components have clear boundaries. SSE processing is isolated from rendering.
- **Exponential backoff:** Correct implementation with `Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1), MAX_BACKOFF_MS)`.
- **Event cleanup:** The `useEffect` cleanup properly closes the EventSource and clears timeouts.
- **Accessibility:** StatusDot has `aria-label` and `title` attributes.

### File-by-file notes

**`hooks/useSSE.ts`** (135 lines): Well-structured. The `handleEvent` callback uses a switch on event type which is clear. The `refetchState` pattern on `connected` event matches the spec's reconnection contract.

**`stores/session-store.ts`** (64 lines): Clean API. `setSessions` correctly preserves existing `activityChangedAt` entries.

**`stores/pod-store.ts`** (35 lines): Minimal and correct.

**`components/sessions/SessionCard.tsx`** (74 lines): Good field rendering with graceful handling of optional fields.

**`components/clusters/ClusterSection.tsx`** (63 lines): Collapsible pattern works well. One interaction concern noted below.

---

## 3. Test Quality

### Strengths

- **Factory functions** (`buildSession`, `buildPod`) with partial overrides: consistent with testing best practices.
- **Tests verify behavior** through public interfaces: store tests assert on state after actions, component tests use `screen` queries.
- **SSE tests mock at the boundary** (EventSource, fetch) without mocking internal logic.
- **Edge cases covered:** reconnection preserves sessions, bulk set replaces state, activity timestamps only update on actual changes.

### One concern

The `updateSession` test in session-store.test.ts has a comment acknowledging the timestamp assertion is weak ("Could be same ms, but the logic ran"). This won't fail even if the timestamp logic was broken with a no-op. However, the test still verifies the activity value changed, which is the primary concern.

---

## 4. Issues

### 🟡 Should Fix

**1. Duplicated `needsAttention` function**

- Files: `components/pods/PodView.tsx:12` and `components/clusters/ClusterView.tsx:12`
- Both define identical logic: `activity === "pending_approval" || activity === "idle"`
- Suggested fix: Extract to a shared utility (e.g., `lib/attention.ts`) or reference the shared `STATE_PRIORITY` from `@pi-fleet/shared` which already defines priority ordering.

**2. Unused `sessions` parameter in `Sidebar.tsx:6`**

- `computeAttentionCount` accepts a `sessions` param but only uses `pods.reduce(...)`. The `sessions` parameter is never referenced.
- Suggested fix: Remove the `sessions` parameter, or remove the function entirely since it's just a one-liner reduce.

**3. Duplicated `handleOpenInTerminal` function**

- Files: `components/sessions/SessionCard.tsx:18` and `components/pods/PodCard.tsx:13`
- Identical bridge-calling pattern in both files.
- Suggested fix: Extract to a shared utility (e.g., `lib/terminal.ts`).

**4. Unused variable in `session-store.ts:58`**

- `const existingMap = get().sessions;` is declared but never used in `setSessions`.
- Suggested fix: Remove the unused binding.

### 🟢 Nit

**5. Inline `EmptyState` component in `MainArea.tsx`**

- The `EmptyState` function is defined in the same file as `MainArea`. Per one-component-per-file conventions, it should be its own file.
- Mitigated by: MainArea is small (45 lines total), and EmptyState is a simple presentational component. Extracting is optional.

**6. ClusterSection: clicking "Unclustered" text is a no-op**

- `ClusterSection.tsx:38`: When `clusterId` is `null`, clicking the cluster name calls `stopPropagation()` but does nothing (no navigation since `if (clusterId)` guard prevents it). This means clicking "Unclustered" text neither navigates nor collapses the section.
- UX impact is minimal since the only cluster is "Unclustered" today. Will resolve naturally when real clusters are implemented.

**7. Cluster SSE events not handled**

- `useSSE.ts` doesn't process `cluster:created`, `cluster:updated`, `cluster:deleted`, or `cluster:reordered` events.
- This is intentional per the design decision ("cluster assignment is a separate ticket"), and the spec's event catalog confirms these are separate concerns. No issue here, just noting for completeness.

---

## 5. Verdict

✅ **Approve**

All 16 acceptance criteria are met. The implementation is well-structured with clean store patterns, proper TypeScript usage, comprehensive tests (46 passing), and sensible design decisions. The build produces a reasonable bundle (244 kB JS, 14 kB CSS) and passes type checking.

The should-fix items are minor code hygiene (duplicated utilities, unused parameter/variable) that don't affect correctness or user experience. They can be addressed in a follow-up cleanup or as part of the next ticket that touches these files.
