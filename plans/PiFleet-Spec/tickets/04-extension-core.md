### Ticket 4: Extension: Activity Tracker + Heartbeat Client

**Type:** AFK
**Blocked by:** #1, #2
**User stories:** US-DATA-01, US-DATA-02

#### What to build

Build the pi-fleet extension that runs inside each pi session process. It registers with the server on `session_start`, sends heartbeats every 5s with rich metadata, and unregisters on `session_end`. Implements: `HeartbeatClient` (HTTP client with register/heartbeat/unregister), `ActivityTracker` (state machine driven by pi lifecycle events), `SessionDataCollector` (gathers model, contextUsage, turnCount, thinkingLevel, lastToolName), and `TmuxTarget` resolver (captures current tmux session:window.pane). Extension entry (`index.ts`) wires all modules to pi lifecycle hooks.

#### Acceptance criteria

- [ ] On `session_start`: extension calls `POST /api/sessions/register` with sessionId, pid, cwd, tmuxTarget, startTime, agentName, subagentId, model
- [ ] Heartbeat fires every 5s with current activity state and all metadata fields
- [ ] On `session_end`: extension calls `POST /api/sessions/:id/unregister`
- [ ] ActivityTracker state machine follows the spec's transition table exactly (8 valid transitions)
- [ ] ActivityTracker ignores invalid transitions (no crash, no state change)
- [ ] SessionDataCollector tracks model changes via `model_select` event
- [ ] SessionDataCollector increments turnCount on each `turn_start`
- [ ] SessionDataCollector captures lastToolName from `tool_execution_end`
- [ ] SessionDataCollector reads contextUsage from `ExtensionContext.getContextUsage()` at heartbeat time
- [ ] TmuxTarget resolver reads `TMUX` env var and runs `tmux display-message -p '#S:#I.#P'`
- [ ] Heartbeat client backs off after 3 consecutive failures (doubles interval, caps at 30s)
- [ ] Unit tests for ActivityTracker: all valid transitions, all invalid transitions
- [ ] Unit tests for HeartbeatClient: success path, failure backoff, unregister idempotency

#### Technical notes

- `subagentId` comes from `process.env.SUBAGENT_ID` (set by subagent-orchestrator's `spawn-config.ts`).
- The extension uses pi's lifecycle hook API: `pi.on("session_start", ...)`, `pi.on("turn_start", ...)`, etc.
- `tmuxTarget` can be null if the session isn't running inside tmux: extension checks for `TMUX` env var.
- HeartbeatClient is a plain `fetch` wrapper: no external HTTP library needed.
- The extension package should be installable via symlink to `~/.pi/agent/extensions/pi-fleet/`.

---

## Completion Summary

**Status:** ✅ Complete
**Completed:** 2026-05-15

### Acceptance Criteria

- ✅ On `session_start`: extension calls `POST /api/sessions/register` with sessionId, pid, cwd, tmuxTarget, startTime, agentName, subagentId, model
- ✅ Heartbeat fires every 5s with current activity state and all metadata fields
- ✅ On `session_end`: extension calls `POST /api/sessions/:id/unregister` (mapped to pi's `session_shutdown` event)
- ✅ ActivityTracker state machine follows the spec's transition table exactly (8 valid transitions)
- ✅ ActivityTracker ignores invalid transitions (no crash, no state change)
- ✅ SessionDataCollector tracks model changes via `model_select` event
- ✅ SessionDataCollector increments turnCount on each `turn_start`
- ✅ SessionDataCollector captures lastToolName from `tool_execution_end`
- ✅ SessionDataCollector reads contextUsage from `ExtensionContext.getContextUsage()` at heartbeat time
- ✅ TmuxTarget resolver reads `TMUX` env var and runs `tmux display-message -p '#S:#I.#P'`
- ✅ Heartbeat client backs off after 3 consecutive failures (doubles interval, caps at 30s)
- ✅ Unit tests for ActivityTracker: all valid transitions, all invalid transitions
- ✅ Unit tests for HeartbeatClient: success path, failure backoff, unregister idempotency

### Changes

**Files created:**

- `extension/src/activity-tracker.ts`: Table-driven state machine with 8 transitions, ignores invalid events
- `extension/src/activity-tracker.test.ts`: 29 tests covering all valid transitions, all invalid transitions, callbacks, timestamps
- `extension/src/tmux-target.ts`: Reads TMUX env var and runs tmux display-message to capture session:window.pane
- `extension/src/tmux-target.test.ts`: 8 tests covering happy path, missing env, exec failures, malformed output
- `extension/src/session-data.ts`: Collects model, turnCount, lastToolName, thinkingLevel, contextUsage
- `extension/src/session-data.test.ts`: 13 tests covering all data collection and snapshot assembly
- `extension/src/heartbeat-client.ts`: fetch-based HTTP client with register/heartbeat/unregister and exponential backoff
- `extension/src/heartbeat-client.test.ts`: 19 tests covering success path, backoff progression, cap, reset, network errors
- `extension/src/index.test.ts`: 9 integration tests verifying event wiring, payload assembly, and lifecycle
- `extension/vitest.config.ts`: Vitest configuration with @pi-fleet/shared alias

**Files modified:**

- `extension/src/index.ts`: Replaced empty export with full extension entry point wiring all modules to pi lifecycle hooks

### Commits

```
18b88d2 feat(extension): wire extension entry point to pi lifecycle hooks
c0f417f feat(extension): add HeartbeatClient with backoff
e7909b0 feat(extension): add SessionDataCollector
eb4dbf3 feat(extension): add TmuxTarget resolver
e1b347c feat(extension): add ActivityTracker state machine
```

### Test Results

```
 RUN  v4.1.6 /Users/thompsnt/Documents/pi-fleet/extension

 Test Files  5 passed (5)
      Tests  78 passed (78)
   Start at  21:15:27
   Duration  154ms
```

Typecheck: `tsc --noEmit` passes with no errors.
Build: `tsdown` produces `dist/index.mjs` (9.45 kB) cleanly.

### Design Decisions

1. **Table-driven state machine over class with counter**: Pi-watch uses a class with a `runningTools` counter and a `permissionStack`. The spec explicitly defines 8 transitions with invalid ones silently ignored. A declarative transition table is simpler, more testable, and matches the spec exactly. Parallel tool execution means only the first tool_execution_start transitions to running_tool; subsequent starts are no-ops per the spec.

2. **Factory functions over classes**: Used `createActivityTracker()`, `createHeartbeatClient()`, `createSessionDataCollector()` factory pattern. Enables dependency injection without class ceremony and aligns with the spec's pseudocode.

3. **`fetch` over `node:http`**: Ticket explicitly states "HeartbeatClient is a plain fetch wrapper." Simpler API, less boilerplate than pi-watch's `http.request` approach.

4. **Permission events via event bus**: Pi doesn't expose native `tool_permission_*` lifecycle events. Permission transitions are wired to `pi-fleet:permission-requested/granted/denied` events on `pi.events` (shared inter-extension bus). This follows the same pattern pi-watch uses and allows future permission detection mechanisms to emit these events.

5. **`session_shutdown` maps to spec's `session_end`**: Pi's actual lifecycle event is `session_shutdown`, not `session_end`. The spec uses the logical name; implementation uses the real API event.

6. **Progressive exponential backoff**: After 3 failures, interval doubles on each subsequent failure (5s → 10s → 20s → 30s cap). Resets to 5s on any success. This is more gradual than pi-watch's binary normal/backoff approach.
