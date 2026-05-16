# Changeset 9: Attention System

**Ticket:** #9 - Attention System
**Date:** 2026-05-15
**Status:** Complete

## Summary

Implemented the attention system: filter-store (zustand), AttentionBadge, FilterBadges, NotificationPanel, and integrated filtering into ClusterView, PodView, and MainArea. Purely client-side: derives from existing SSE session state.

## Files Created

| Path                                                           | Purpose                                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `client/src/stores/filter-store.ts`                            | Zustand store: toggle/clear/passesFilter/podPassesFilter with OR logic |
| `client/src/stores/filter-store.test.ts`                       | 13 unit tests for filter logic                                         |
| `client/src/lib/format-relative-time.ts`                       | "Xm ago" / "Xh ago" relative time formatter                            |
| `client/src/lib/format-relative-time.test.ts`                  | 5 unit tests                                                           |
| `client/src/components/attention/AttentionBadge.tsx`           | Numeric badge (hidden at 0, "9+" cap)                                  |
| `client/src/components/attention/AttentionBadge.test.tsx`      | 6 unit tests                                                           |
| `client/src/components/attention/FilterBadges.tsx`             | Clickable state filter badges (color-coded, aria-pressed)              |
| `client/src/components/attention/FilterBadges.test.tsx`        | 4 component tests                                                      |
| `client/src/components/attention/NotificationPanel.tsx`        | Global notification panel (bell dropdown)                              |
| `client/src/components/attention/NotificationPanel.test.tsx`   | 5 component tests (entries, Open button IPC, close)                    |
| `client/src/components/attention/NotificationItem.tsx`         | Single notification entry rendering                                    |
| `client/src/components/attention/derive-notifications.ts`      | Pure derivation of notification entries from store state               |
| `client/src/components/attention/derive-notifications.test.ts` | 5 unit tests                                                           |
| `client/src/components/attention/types.ts`                     | NotificationEntry interface                                            |
| `client/src/components/attention/index.ts`                     | Barrel exports                                                         |

## Files Modified

| Path                                             | Change                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| `client/src/components/layout/Header.tsx`        | Added bell icon + attention count badge + NotificationPanel toggle          |
| `client/src/components/layout/MainArea.tsx`      | Removed clusterName prop usage; added AllPodsView with FilterBadges         |
| `client/src/components/clusters/ClusterView.tsx` | Integrated FilterBadges + filter-based pod filtering                        |
| `client/src/components/pods/PodView.tsx`         | Integrated FilterBadges + filter-based session filtering                    |
| `client/src/components/pods/PodView.test.tsx`    | Updated selectors to use role queries (disambiguate from FilterBadges text) |

## Commits

```
08aceb4 feat: add filter-store with toggle, clear, passesFilter, and OR logic
9ebffa4 feat: add relative time formatter utility
900cac2 feat: add attention components (AttentionBadge, FilterBadges, NotificationPanel)
e047c9b feat: integrate bell icon and notification panel into Header
552859d feat: integrate filter system into ClusterView, PodView, and MainArea
```

## Test Results

```
 Test Files  14 passed (14)
      Tests  91 passed (91)
   Duration  1.97s

TypeScript: npx tsc --noEmit → 0 errors
```

## Design Decisions

1. **Dropdown panel over shadcn Sheet**: NotificationPanel uses absolute-positioned dropdown rather than a Sheet component. More conventional for bell-icon patterns, doesn't obscure content.

2. **activityChangedAt stays in session-store**: Already established there from earlier tickets. filter-store stays focused on filter state only.

3. **FilterBadges hide zero-count states**: Reduces visual noise; only states with active sessions shown.

4. **AllPodsView in MainArea**: Created inline component for the default/unclustered route to avoid coupling to cluster store lookup when no specific cluster is selected.
