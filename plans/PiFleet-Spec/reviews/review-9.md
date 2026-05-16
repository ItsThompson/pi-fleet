# Review: Ticket 9 - Attention System

**Reviewer:** automated
**Date:** 2026-05-15
**Verdict:** ✅ Approve

---

## 1. Acceptance Criteria Audit

| Criterion                                                         | Status | Notes                                                                    |
| ----------------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| Pod badge shows count of `pending_approval`/`idle`; hidden when 0 | ✅ Met | `AttentionBadge` returns null at count 0, renders numeric otherwise      |
| Cluster badge = sum of pod badges; hidden when 0                  | ✅ Met | `ClusterSection` aggregates via `attentionCount` prop                    |
| Badge count capped at "9+" for >9                                 | ✅ Met | `count > 9 ? "9+" : String(count)` in `AttentionBadge`                   |
| Badges update in real-time via SSE                                | ✅ Met | Zustand reactive stores: SSE → session-store → pod-store → re-render     |
| Filter badges render in view headers                              | ✅ Met | `FilterBadges` integrated into `ClusterView`, `PodView`, `AllPodsView`   |
| Clicking filter badge toggles it                                  | ✅ Met | `toggleFilter` with `aria-pressed` visual state                          |
| Multiple filters use OR logic                                     | ✅ Met | `passesFilter` checks `activeFilters.has(session.activity)`              |
| Active filter hides non-matching cards/pods                       | ✅ Met | Both views filter through `podPassesFilter`/`passesFilter`               |
| Clicking active badge clears it                                   | ✅ Met | `toggleFilter` removes from set if present                               |
| Bell icon in Header with panel                                    | ✅ Met | Bell icon with click-to-toggle panel                                     |
| Bell icon shows total attention count                             | ✅ Met | `computeTotalAttention` counts idle + pending_approval                   |
| Panel shows reverse-chronological entries                         | ✅ Met | `deriveNotificationEntries` sorts by `stateChangedAt` desc               |
| Entry shows: session name, pod, cluster, state, relative time     | ✅ Met | `NotificationItem` renders all fields                                    |
| "Open" triggers terminal open                                     | ✅ Met | `handleOpenInTerminal` calls `window.piFleet.openSession(sessionId)`     |
| Entry auto-removes on state change                                | ✅ Met | Derived reactively: non-attention sessions excluded                      |
| `activityChangedAt` tracked per session                           | ✅ Met | In `session-store`, updated on activity field change                     |
| Unit tests for filter-store                                       | ✅ Met | 16 tests covering toggle, clear, passesFilter, podPassesFilter, OR logic |
| Component tests for NotificationPanel                             | ✅ Met | 6 tests: entries, "Open" button IPC, empty state, close, cluster name    |

---

## 2. Code Quality

### What was done well

- **Architecture**: Excellent separation. Pure derivation logic (`deriveNotificationEntries`) is independently testable. Store logic (`filter-store`) is separate from rendering. Components are thin and focused.
- **Accessibility**: `aria-pressed` on filter badges, `aria-label` on bell button and badge, `aria-expanded` on the panel toggle. This is production-quality a11y.
- **Reactive design**: Correctly leverages Zustand subscriptions so badge counts update without polling.
- **Working group toggle**: Grouping `processing` + `running_tool` under a single "Working" badge is a UX improvement that doesn't conflict with spec.
- **Outside-click close**: The notification panel properly closes on outside click with a clean `useEffect` cleanup.
- **Design decision #1 (dropdown vs Sheet)**: Good call. A dropdown is more appropriate for a notification bell pattern.
- **Design decision #3 (hide zero-count badges)**: Reduces visual noise per spec.

### File-by-file notes

**`filter-store.ts`** (64 lines): Clean Zustand store. Interface mirrors the spec's `FilterState`. The Working group toggle logic is elegant.

**`derive-notifications.ts`** (56 lines): Pure function, easy to test. Proper fallback chain for `sessionName` (agentName → cwd basename → sessionId).

**`AttentionBadge.tsx`** (23 lines): Minimal, focused. Good use of `aria-label` with actual count for screen readers.

**`FilterBadges.tsx`** (84 lines): Config-driven badge rendering. The `FILTER_CONFIGS` array is a clean pattern that avoids repetition.

**`NotificationPanel.tsx`** (53 lines): Properly composes `deriveNotificationEntries` + `NotificationItem`. The `ScrollArea` with `max-h-96` prevents the panel from overflowing.

**`NotificationItem.tsx`** (44 lines): Well-structured entry with status dot, session name, pod/cluster info, relative time, and Open button.

**`Header.tsx`** (78 lines): Clean integration. The outside-click handler is properly scoped.

---

## 3. Test Quality

**Strong points:**

- Factory functions (`buildSession`, `buildPod`, `buildCluster`) used across all test files
- Tests verify behavior through public interfaces (store methods, rendered output)
- Edge cases covered: missing sessions in `podPassesFilter`, zero count, future timestamps, no pod for session
- `deriveNotificationEntries` tests cover: empty, filtering, sorting, session name fallback, cluster resolution
- IPC bridge test properly sets up and tears down `window.piFleet`

**Test count verification (actual vs completion summary):**

- filter-store: 16 actual (summary said 13): more tests than claimed
- FilterBadges: 6 actual (summary said 4): more tests than claimed
- NotificationPanel: 6 actual (summary said 5): more tests than claimed
- derive-notifications: 8 actual (summary said 5): more tests than claimed
- AttentionBadge: 6 actual ✓
- format-relative-time: 5 actual ✓

All actual test counts exceed or match claims: no missing coverage.

---

## 4. Issues

### 🟡 Should fix: Duplicated `needsAttention` helper

**Files:** `client/src/components/clusters/ClusterView.tsx:17`, `client/src/components/pods/PodView.tsx:12`

Both define:

```typescript
function needsAttention(state: ActivityStatus): boolean {
	return state === "pending_approval" || state === "idle";
}
```

This is a domain truth (which states constitute "needs attention") already codified in `filter-store.ts` as `ATTENTION_STATES`. Should use a shared predicate from `filter-store` or a shared utility.

**Suggested fix:** Export a `isAttentionState` predicate from filter-store (or a shared lib) and import it in both views.

---

### 🟡 Should fix: Duplicated `ClusterWithPods` interface

**Files:** `client/src/stores/cluster-store.ts:4`, `client/src/components/attention/derive-notifications.ts:4`

Both define:

```typescript
interface ClusterWithPods extends ClusterDefinition {
	podIds: string[];
}
```

The `derive-notifications.ts` version omits `attentionCount` but both extend the same base with `podIds`.

**Suggested fix:** Export `ClusterWithPods` from `cluster-store.ts` (or a shared types file) and import it in `derive-notifications.ts`.

---

### 🟡 Should fix: `computeTotalAttention` in Header duplicates attention logic

**File:** `client/src/components/layout/Header.tsx:14-21`

The `computeTotalAttention` function re-implements the "idle or pending_approval" check inline rather than referencing `ATTENTION_STATES` from filter-store.

**Suggested fix:** Import and use `ATTENTION_STATES` from filter-store:

```typescript
import { ATTENTION_STATES } from "@/stores/filter-store";
// ...
if (ATTENTION_STATES.has(session.activity as ActivityStatus)) count += 1;
```

---

### 🟢 Nit: `AllPodsView` and `EmptyState` inline in MainArea.tsx

**File:** `client/src/components/layout/MainArea.tsx`

`AllPodsView` (~50 lines) is a substantial component defined inline. Per frontend coding standards, each component should have its own file. This was an intentional design decision per the completion summary, and `MainArea.tsx` totals ~100 lines so it's not urgent.

---

### 🟢 Nit: Window type assertion in NotificationPanel

**File:** `client/src/components/attention/NotificationPanel.tsx:15`

```typescript
const bridge = (
	window as unknown as { piFleet?: { openSession: (id: string) => void } }
).piFleet;
```

This is fine for Electron bridge interop, but could be cleaner with a declared global interface in a `global.d.ts`. This is a pre-existing pattern though, so not something this ticket should change.

---

### 🟢 Nit: Completion summary test counts are understated

The completion summary reports fewer tests than actually exist (13 vs 16 for filter-store, 5 vs 8 for derive-notifications, etc.). Not a code issue, but the summary doesn't reflect the true scope of coverage. This is a "too humble" problem.

---

## 5. Verdict

### ✅ Approve

All 18 acceptance criteria are met. No must-fix issues. The implementation is well-architected, properly tested (47 tests across the attention system alone), and makes sound design decisions. The "should fix" items are minor DRY violations that don't affect correctness or user-facing behavior.
