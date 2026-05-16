# 11: Testing Strategy

## Philosophy

Pi-fleet has three distinct runtime boundaries, each with different testing needs:

1. **Server** (pure logic + HTTP): highest test density. Session registry, pod registry, cluster assignment, and terminal opener logic are all pure functions or have injected dependencies. These are the deep modules: test exhaustively.
2. **Extension** (pi API integration): medium density. Activity tracker and session data collector are testable in isolation. Pod reporter protocol logic is testable with mock event buses.
3. **Client** (React + zustand): test stores (pure state logic) heavily. Component tests for critical interactions (DnD, navigation). Avoid testing shadcn internals.

### What Makes a Good Test Here

- Tests verify **external behavior**, not implementation details.
- State machine transitions (activity tracker, pod lifecycle) are exhaustively tested: every valid transition and every invalid transition that should be rejected.
- Server route tests verify the HTTP contract (status codes, response shapes), not internal registry state.
- Client store tests verify derived state computation (pod aggregation, cluster assignment, filter logic).
- Component tests verify user-visible interactions (click → navigation, drag → reassignment), not DOM structure.

## Test Layers

| Layer                | Scope                                                          | Tooling                     | What They Mock                                   |
| -------------------- | -------------------------------------------------------------- | --------------------------- | ------------------------------------------------ |
| Unit (server)        | Registry, pod computation, cluster assignment, terminal opener | Vitest                      | exec (shell commands), file system               |
| Unit (extension)     | Activity tracker, session data collector, pod reporter         | Vitest                      | pi.events, HTTP client, process.env              |
| Unit (client stores) | Zustand store logic, filter computation, pod derivation        | Vitest                      | Nothing (pure state)                             |
| Component (client)   | Individual components in isolation                             | Vitest + Testing Library    | Zustand stores (pre-populated), window.piFleet   |
| Integration (client) | Multi-component flows (sidebar → grid → terminal open)         | Vitest + Testing Library    | API calls (MSW or fetch mock), SSE stream        |
| E2E                  | Full app: Electron + server + extension + tmux                 | Playwright + custom harness | Nothing (real tmux, real extension, real server) |

## Key Testing Targets (Highest Density)

### 1. Terminal Opener (`desktop/src/terminal-opener.ts`)

Why: highest user-visible impact; multiple failure modes; shell command orchestration.

Test cases:

- Happy path: parse → validate → list-clients (1 client) → switch → activate
- Pane not found: validate returns false → notification + early return
- No client: list-clients returns 0 → notification
- Multi-client: list-clients returns 2+ → notification
- Switch fails: exec throws → notification with stderr
- Activation fails: osascript throws → non-fatal (switch succeeded)
- Invalid target format: regex doesn't match → notification
- Null target: not-in-tmux → notification

### 2. Pod Registry (`server/src/pod-registry.ts`)

Why: complex state computation; many lifecycle transitions; core data model.

Test cases:

- Single session registers → single-member pod
- Parent reports ownership → children group under parent
- Parent dies → children become standalone pods
- Child dies → removed from pod, pod continues
- All members die → pod removed
- Ownership report with unknown subagentIds → ignored until they register
- Multiple ownership reports → idempotent
- State aggregation: worst-state bubbles up
- Attention count: correct sum of attention-needing members

### 3. Cluster Assignment (`server/src/cluster-assignment.ts`)

Why: pure function with clear rules; many edge cases in path matching.

Test cases:

- Manual override takes precedence over directory match
- Longest prefix wins among multiple directory matches
- Tilde expansion works
- Trailing slash normalization
- No match → unclustered
- Deleted cluster in manual assignment → unclustered
- Empty directories list → no auto-assignment for that cluster

### 4. Filter Store (`client/src/stores/filter-store.ts`)

Why: pure state logic that gates all UI rendering.

Test cases:

- No filters → everything passes
- Single filter → only matching states pass
- Multiple filters → OR logic
- Toggle on/off
- Pod passes if any member passes
- Clear all filters

### 5. Pod Reporter (`extension/src/pod-reporter.ts`)

Why: protocol correctness is critical for pod formation.

Test cases:

- Startup: emits request, handles response
- Signal received: re-requests registry
- Response received: posts ownership to server
- No response (orchestrator not loaded): no crash, no retry spam
- Multiple rapid signals: debounce or handle each

## Manual Smoke Tests

### Smoke 1: Basic Session Lifecycle

1. Start pi-fleet (`npm run app`)
2. Open tmux, start a pi session
3. Verify session appears in sidebar within 5s
4. Verify session card shows model name and context %
5. Press F5: overlay hides. Press F5 again: overlay shows.
6. Click session card "Open in terminal": terminal comes to foreground with correct pane

### Smoke 2: Pod Formation

1. Start a pi session with subagent-orchestrator loaded
2. Spawn a subagent (e.g., `/subagents spawn`)
3. Verify child appears nested under parent within 10s
4. Kill the child: verify pod returns to single-member
5. Kill the parent: verify child becomes standalone pod

### Smoke 3: Cluster Management

1. Create a cluster "Work" with directory `~/workplace/`
2. Start a pi session in `~/workplace/my-project/`
3. Verify session auto-assigns to "Work" cluster
4. Drag the pod to "Unclustered"
5. Quit and restart pi-fleet: verify pod is still in "Unclustered" (manual override persisted)
6. Delete "Work" cluster: verify confirmation dialog, then cluster disappears

### Smoke 4: Attention System

1. Start 3 pi sessions
2. In one session, trigger a tool approval prompt (don't approve)
3. Verify: pod badge shows "1", cluster badge shows "1"
4. Open notification panel: verify entry appears with correct session name
5. Click "Open" on the notification: terminal opens to that session
6. Approve the tool: verify badge disappears, notification entry removes

### Smoke 5: Ghost Mode and Sound

1. Enable ghost mode from tray: verify overlay becomes translucent
2. Click through the overlay: verify click reaches window below
3. Enable sound, trigger an idle transition: verify sound plays
4. Disable sound, trigger another: verify no sound

### Smoke 6: Drag-and-Drop

1. Create two clusters: "A" and "B"
2. Start sessions that auto-assign to cluster A
3. Drag a pod from A to B: verify it moves
4. Reorder clusters: drag B above A
5. Restart app: verify new order persisted
