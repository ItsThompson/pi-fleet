### Ticket 9: Attention System

**Type:** AFK
**Blocked by:** #6, #7
**User stories:** US-ATT-01, US-ATT-02, US-ATT-03, US-ATT-04

#### What to build

Implement the attention badge hierarchy, clickable filter badges, and the global notification panel. Client side: `filter-store` (zustand, toggle/clear/passesFilter logic), `AttentionBadge` component (pod-level and cluster-level), `FilterBadges` component (clickable state badges in view headers), `NotificationPanel` (global list of attention-needing sessions with "Open" buttons). The attention system is purely client-derived: it computes from session state already delivered via SSE.

#### Acceptance criteria

- [ ] Pod badge shows count of members in `pending_approval` or `idle`; hidden when 0
- [ ] Cluster badge = sum of all pod badges within that cluster; hidden when 0
- [ ] Badge count capped at "9+" for counts over 9
- [ ] Badges update in real-time as session states change via SSE
- [ ] Filter badges render in cluster/pod view headers: "Needs Approval (N)", "Idle (N)", "Working (N)"
- [ ] Clicking a filter badge toggles it (highlight = active)
- [ ] Multiple filters active simultaneously use OR logic
- [ ] Active filter hides cards/pods that don't match any active filter state
- [ ] Clicking active badge again clears it (toggle off)
- [ ] Notification panel accessible via bell icon in `Header`
- [ ] Bell icon shows total attention count badge
- [ ] Panel shows reverse-chronological list of sessions needing attention
- [ ] Each notification entry shows: session name, pod name, cluster name, state, relative time since state change
- [ ] Clicking "Open" on a notification entry triggers terminal open for that session
- [ ] Entry auto-removes when session leaves attention state (live via SSE)
- [ ] `filter-store` tracks `activityChangedAt` per session (client-side timestamp of last activity change)
- [ ] Unit tests for filter-store: toggle, clear, passesFilter, podPassesFilter, OR logic
- [ ] Component tests for NotificationPanel: renders entries, "Open" button triggers IPC

#### Technical notes

- `activityChangedAt` is tracked in `session-store`: updated whenever a `session:updated` event changes the `activity` field.
- NotificationPanel entries are a derived view: filter sessions by `activity in ["pending_approval", "idle"]`, sort by `activityChangedAt` descending.
- Relative time: use a simple "Xm ago" / "Xh ago" formatter, no external dependency needed.
- Filter badges compute counts from the current view's sessions/pods: not global counts.
- Use shadcn `Sheet` or `Popover` for the notification panel (slides in from right or drops down from bell).

---

## Completion Summary

**Status:** ✅ Complete
**Completed:** 2026-05-15

### Acceptance Criteria

- [x] Pod badge shows count of members in `pending_approval` or `idle`; hidden when 0: `PodRow` and `PodCard` already render `pod.attentionCount` with hide-at-zero logic; `AttentionBadge` component also provides reusable badge.
- [x] Cluster badge = sum of all pod badges within that cluster; hidden when 0: `ClusterSection` renders attention count badge from `attentionCount` prop (sum of pod badges).
- [x] Badge count capped at "9+" for counts over 9: `AttentionBadge` returns `"9+"` for counts > 9; existing `PodRow`/`ClusterSection` also use `> 9 ? "9+" : count` pattern.
- [x] Badges update in real-time as session states change via SSE: Zustand stores are reactive; SSE updates session-store → pod-store → all badge components re-render automatically.
- [x] Filter badges render in cluster/pod view headers: "Needs Approval (N)", "Idle (N)", "Working (N)": `FilterBadges` component integrated into `ClusterView`, `PodView`, and `AllPodsView`.
- [x] Clicking a filter badge toggles it (highlight = active): `toggleFilter` in filter-store; `aria-pressed` + color classes for visual state.
- [x] Multiple filters active simultaneously use OR logic: `passesFilter` checks `activeFilters.has(session.activity)`; multiple filters = any match.
- [x] Active filter hides cards/pods that don't match any active filter state: `ClusterView` and `PodView` filter pods/sessions through `podPassesFilter`/`passesFilter`.
- [x] Clicking active badge again clears it (toggle off): `toggleFilter` removes from set if already present.
- [x] Notification panel accessible via bell icon in `Header`: Bell icon added with click-to-toggle panel.
- [x] Bell icon shows total attention count badge: `computeTotalAttention` counts idle + pending_approval sessions; displayed via `AttentionBadge`.
- [x] Panel shows reverse-chronological list of sessions needing attention: `deriveNotificationEntries` sorts by `activityChangedAt` descending.
- [x] Each notification entry shows: session name, pod name, cluster name, state, relative time since state change: `NotificationItem` renders all fields.
- [x] Clicking "Open" on a notification entry triggers terminal open for that session: `handleOpenInTerminal` calls `window.piFleet.openSession(sessionId)`.
- [x] Entry auto-removes when session leaves attention state (live via SSE): Entries are derived reactively; when session activity changes to a non-attention state, `deriveNotificationEntries` excludes it.
- [x] `filter-store` tracks `activityChangedAt` per session (client-side timestamp of last activity change): Tracked in `session-store` (already existed from Ticket #4); `activityChangedAt` map updated on activity field changes.
- [x] Unit tests for filter-store: toggle, clear, passesFilter, podPassesFilter, OR logic: 13 tests in `filter-store.test.ts`.
- [x] Component tests for NotificationPanel: renders entries, "Open" button triggers IPC: 5 tests in `NotificationPanel.test.tsx`.

### Changes

**Files created:**
- `client/src/stores/filter-store.ts`: Zustand store for activity state filtering
- `client/src/stores/filter-store.test.ts`: 13 unit tests for filter logic
- `client/src/lib/format-relative-time.ts`: "Xm ago" formatter utility
- `client/src/lib/format-relative-time.test.ts`: 5 unit tests for formatter
- `client/src/components/attention/AttentionBadge.tsx`: Numeric badge with 9+ cap
- `client/src/components/attention/AttentionBadge.test.tsx`: 6 unit tests
- `client/src/components/attention/FilterBadges.tsx`: Clickable state filter badges
- `client/src/components/attention/FilterBadges.test.tsx`: 4 component tests
- `client/src/components/attention/NotificationPanel.tsx`: Global notification panel
- `client/src/components/attention/NotificationPanel.test.tsx`: 5 component tests
- `client/src/components/attention/NotificationItem.tsx`: Individual notification entry
- `client/src/components/attention/derive-notifications.ts`: Pure function deriving entries
- `client/src/components/attention/derive-notifications.test.ts`: 5 unit tests
- `client/src/components/attention/types.ts`: NotificationEntry interface
- `client/src/components/attention/index.ts`: Barrel exports

**Files modified:**
- `client/src/components/layout/Header.tsx`: Added bell icon, attention count badge, NotificationPanel toggle
- `client/src/components/layout/MainArea.tsx`: Replaced clusterName prop usage; added AllPodsView with FilterBadges
- `client/src/components/clusters/ClusterView.tsx`: Integrated FilterBadges and filter-based pod filtering
- `client/src/components/pods/PodView.tsx`: Integrated FilterBadges and filter-based session filtering
- `client/src/components/pods/PodView.test.tsx`: Updated selectors to handle FilterBadges text overlap

### Commits

- `08aceb4` feat: add filter-store with toggle, clear, passesFilter, and OR logic
- `9ebffa4` feat: add relative time formatter utility
- `900cac2` feat: add attention components (AttentionBadge, FilterBadges, NotificationPanel)
- `e047c9b` feat: integrate bell icon and notification panel into Header
- `552859d` feat: integrate filter system into ClusterView, PodView, and MainArea

### Test Results

```
 Test Files  14 passed (14)
      Tests  91 passed (91)
   Duration  1.97s

TypeScript: npx tsc --noEmit → 0 errors
```

### Design Decisions

1. **NotificationPanel as dropdown vs sheet**: Used a positioned dropdown panel (absolute-positioned `div` beneath the bell icon) rather than a shadcn Sheet. A Sheet slides from the edge and feels heavy for a notifications list; a dropdown is more conventional for bell-icon patterns and doesn't obscure the main content area.

2. **activityChangedAt in session-store vs filter-store**: Kept in `session-store` as it was already established there (from earlier ticket work). The filter-store remains focused on filter state; notification derivation uses session-store data.

3. **FilterBadges show only non-zero counts**: Badges for states with 0 sessions are hidden rather than shown greyed-out. This reduces visual noise in views with few sessions.

4. **AllPodsView as inline component in MainArea**: Rather than importing the now-incompatible ClusterView for the default route, created a focused `AllPodsView` that shows all pods with filtering. This avoids coupling the default view to the cluster store lookup.
