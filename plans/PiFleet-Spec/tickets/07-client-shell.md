### Ticket 7: Client Shell: Sidebar + Session Cards + SSE Hook

**Type:** AFK
**Blocked by:** #3
**User stories:** US-NAV-01, US-NAV-02, US-NAV-03, US-NAV-04, US-DATA-01, US-DATA-02, US-SETUP-01, US-SETUP-03

#### What to build

Build the React client with zustand stores and core UI components. This creates the visual shell: sidebar with cluster/pod navigation, main area with card grids, session cards showing rich metadata, and real-time updates via SSE. Implements: `session-store` (SSE subscription + state), `pod-store` (derived from sessions), `navigation-store` (current view routing), `useSSE` hook (connection + reconnect + state refresh), `Sidebar`, `MainArea`, `Header`, `SessionCard`, `SessionStatusDot`, `PodCard`, `PodRow`, `ClusterSection`, `ClusterView`, `PodView`. Includes empty state for first launch.

#### Acceptance criteria

- [ ] `useSSE` connects to `GET /api/events`, processes all event types, reconnects with exponential backoff (1s, 2s, 4s, max 30s)
- [ ] "Reconnecting..." banner appears when SSE disconnects, disappears on reconnect
- [ ] On reconnect: full state refetch from `GET /api/sessions` + `GET /api/pods`
- [ ] Session data is NOT cleared during reconnection attempts
- [ ] `session-store` adds/updates/removes sessions reactively from SSE events
- [ ] `pod-store` derives pods from session state and pod SSE events
- [ ] Sidebar renders cluster sections with chevron-expandable pod lists
- [ ] Clicking cluster name shows `ClusterView` (card grid of pods) in main area
- [ ] Clicking pod shows `PodView` (card grid of sessions) in main area
- [ ] `SessionCard` displays: session name, activity status dot, model name, context usage %, turn count, thinking level, "Open in terminal" button
- [ ] `SessionStatusDot` colors: processing=blue, running_tool=green, idle=yellow, pending_approval=red
- [ ] Subagent sessions show "sub" badge; lead sessions show "lead" label in multi-member pods
- [ ] Cards grouped into "Needs Attention" and "Working" sections with counts (US-NAV-04)
- [ ] Empty state: with zero sessions, main area shows explanatory message + setup hint
- [ ] "Open in terminal" button calls `window.piFleet.openSession(sessionId)`
- [ ] Component tests for SessionCard (renders all fields), Sidebar (navigation), state grouping

#### Technical notes

- Use shadcn `Card`, `Badge`, `Button`, `Collapsible`, `ScrollArea` components.
- `navigation-store` tracks `{ view: "cluster" | "pod" | "notifications", id?: string }`.
- Context usage rendered as a progress bar (shadcn `Progress` or custom with Tailwind).
- Status dot colors via Tailwind classes: `bg-blue-500`, `bg-green-500`, `bg-yellow-500`, `bg-red-500`.
- `useSSE` should use `EventSource` API. On `error` event: set reconnecting state, schedule retry.
- Empty state check: `sessions.size === 0` in session-store.

---

## Completion Summary

**Status:** ✅ Complete
**Completed:** 2026-05-15

### Acceptance Criteria

- ✅ `useSSE` connects to `GET /api/events`, processes all event types, reconnects with exponential backoff (1s, 2s, 4s, max 30s)
- ✅ "Reconnecting..." banner appears when SSE disconnects, disappears on reconnect
- ✅ On reconnect: full state refetch from `GET /api/sessions` + `GET /api/pods`
- ✅ Session data is NOT cleared during reconnection attempts
- ✅ `session-store` adds/updates/removes sessions reactively from SSE events
- ✅ `pod-store` derives pods from session state and pod SSE events
- ✅ Sidebar renders cluster sections with chevron-expandable pod lists
- ✅ Clicking cluster name shows `ClusterView` (card grid of pods) in main area
- ✅ Clicking pod shows `PodView` (card grid of sessions) in main area
- ✅ `SessionCard` displays: session name, activity status dot, model name, context usage %, turn count, thinking level, "Open in terminal" button
- ✅ `SessionStatusDot` colors: processing=blue, running_tool=green, idle=yellow, pending_approval=red
- ✅ Subagent sessions show "sub" badge; lead sessions show "lead" label in multi-member pods
- ✅ Cards grouped into "Needs Attention" and "Working" sections with counts (US-NAV-04)
- ✅ Empty state: with zero sessions, main area shows explanatory message + setup hint
- ✅ "Open in terminal" button calls `window.piFleet.openSession(sessionId)`
- ✅ Component tests for SessionCard (renders all fields), Sidebar (navigation), state grouping

### Changes

**Files created:**
- `client/src/stores/session-store.ts`: Zustand store for session state with activityChangedAt tracking
- `client/src/stores/pod-store.ts`: Zustand store for pod state from SSE events
- `client/src/stores/navigation-store.ts`: Zustand store for view routing (cluster/pod/notifications)
- `client/src/hooks/useSSE.ts`: SSE connection hook with exponential backoff reconnection
- `client/src/components/ui/card.tsx`: shadcn Card component
- `client/src/components/ui/badge.tsx`: shadcn Badge component
- `client/src/components/ui/button.tsx`: shadcn Button component
- `client/src/components/ui/collapsible.tsx`: shadcn Collapsible component
- `client/src/components/ui/scroll-area.tsx`: shadcn ScrollArea component
- `client/src/components/ui/progress.tsx`: shadcn Progress component
- `client/src/components/sessions/SessionCard.tsx`: Rich session card with all metadata fields
- `client/src/components/sessions/SessionStatusDot.tsx`: Colored activity status indicator
- `client/src/components/pods/PodCard.tsx`: Pod card for cluster view grids
- `client/src/components/pods/PodRow.tsx`: Compact pod row for sidebar
- `client/src/components/pods/PodView.tsx`: Card grid of sessions with state grouping
- `client/src/components/clusters/ClusterSection.tsx`: Collapsible sidebar cluster section
- `client/src/components/clusters/ClusterView.tsx`: Card grid of pods with state grouping
- `client/src/components/layout/Header.tsx`: App header with connection status
- `client/src/components/layout/Sidebar.tsx`: Sidebar with cluster/pod navigation
- `client/src/components/layout/MainArea.tsx`: View router with empty state
- `client/src/App.tsx`: Root layout composing all shell components
- `client/src/stores/session-store.test.ts`: Session store unit tests (7 tests)
- `client/src/stores/pod-store.test.ts`: Pod store unit tests (4 tests)
- `client/src/stores/navigation-store.test.ts`: Navigation store unit tests (4 tests)
- `client/src/hooks/useSSE.test.ts`: SSE hook tests with mock EventSource (11 tests)
- `client/src/components/sessions/SessionCard.test.tsx`: SessionCard render tests (11 tests)
- `client/src/components/layout/Sidebar.test.tsx`: Sidebar navigation tests (6 tests)
- `client/src/components/pods/PodView.test.tsx`: State grouping tests (3 tests)

**Files modified:**
- `client/src/main.tsx`: Updated to use new App component

### Commits

- `85811d1` feat(client): add zustand stores for sessions, pods, and navigation
- `cfa3835` feat(client): add useSSE hook with EventSource connection and reconnect
- `29dc643` feat(client): add shadcn UI primitives (Card, Badge, Button, Collapsible, ScrollArea, Progress)
- `c148bf8` feat(client): add session, pod, and cluster UI components
- `175b04d` feat(client): wire App shell with Header, Sidebar, MainArea, and empty state

### Test Results

```
 RUN  v4.1.6 /Users/thompsnt/Documents/pi-fleet/client

 Test Files  7 passed (7)
      Tests  46 passed (46)
   Start at  21:30:10
   Duration  1.17s
```

Typecheck: `tsc --noEmit` passes with no errors.
Build: `vite build` produces dist (243.85 kB JS, 13.68 kB CSS).

### Design Decisions

1. **All pods in "Unclustered" for now**: Cluster assignment logic (directory matching, manual overrides) is a separate ticket. The sidebar renders a single "Unclustered" section with all pods. The ClusterSection component accepts a `clusterId` prop ready for future cluster ticket integration.

2. **Store-level SSE dispatch over component-level**: The `useSSE` hook dispatches directly to zustand stores via `getState()` rather than through React re-renders. This keeps the SSE event processing decoupled from React's render cycle and avoids stale closure issues.

3. **Minimal shadcn implementations**: Rather than running `shadcn add` (which requires interactive CLI), the UI components are manually created following shadcn's patterns. They use the same Tailwind CSS variables and CVA variants. Can be replaced with official shadcn CLI output later.

4. **activityChangedAt tracked client-side**: The session store tracks when each session's activity last changed, enabling future notification panel ordering. This is client-local state not sent back to the server.

5. **Progress bar for context usage**: Used shadcn Progress component with Tailwind styling rather than a custom circular gauge, matching the spec's recommendation and keeping the card layout compact.
