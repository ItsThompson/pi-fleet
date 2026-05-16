# Review: Ticket 4 — Extension: Activity Tracker + Heartbeat Client

**Reviewer:** automated
**Date:** 2026-05-15
**Verdict:** ✅ Approve

---

## 1. Acceptance Criteria Audit

| #   | Criterion                                                            | Status | Notes                                                                                                                          |
| --- | -------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `session_start` → `POST /api/sessions/register` with all fields      | ✅ Met | Payload includes sessionId, pid, cwd, tmuxTarget, startTime, agentName, subagentId, model. Verified by `index.test.ts`.        |
| 2   | Heartbeat fires every 5s with activity state + metadata              | ✅ Met | `startHeartbeats` uses `HEARTBEAT_INTERVAL_MS` from shared constants. Snapshot includes tracker state + data collector fields. |
| 3   | `session_end` → `POST /api/sessions/:id/unregister`                  | ✅ Met | Mapped to pi's real `session_shutdown` event. Documented as design decision.                                                   |
| 4   | State machine follows spec's 8 transitions exactly                   | ✅ Met | Table-driven `TRANSITIONS` map matches spec section 08 1:1.                                                                    |
| 5   | Invalid transitions are silently ignored                             | ✅ Met | `TRANSITIONS[current]?.[event]` returns undefined → early return. 13 invalid-transition test cases.                            |
| 6   | SessionDataCollector tracks model via `model_select`                 | ✅ Met | `onModelSelect(event.model.name)` wired in `index.ts`.                                                                         |
| 7   | SessionDataCollector increments turnCount on `turn_start`            | ✅ Met | `onTurnStart()` increments counter, wired alongside tracker's `onTurnStart()`.                                                 |
| 8   | SessionDataCollector captures lastToolName from `tool_execution_end` | ✅ Met | `onToolExecutionEnd(event.toolName)` wired in `index.ts`.                                                                      |
| 9   | SessionDataCollector reads contextUsage at heartbeat time            | ✅ Met | `extensionCtx?.getContextUsage()` called inside heartbeat snapshot callback.                                                   |
| 10  | TmuxTarget resolver reads `TMUX` env + runs `tmux display-message`   | ✅ Met | `captureTmuxTarget(env, exec)` checks env var, execs command, parses output.                                                   |
| 11  | Backoff after 3 consecutive failures (double interval, cap 30s)      | ✅ Met | `computeInterval` doubles after `FAILURE_THRESHOLD`, caps at `MAX_BACKOFF_MS`. Tested with fake timers.                        |
| 12  | Unit tests: ActivityTracker valid + invalid transitions              | ✅ Met | 29 tests: 8 valid transitions, 13 invalid transitions, callbacks, timestamps.                                                  |
| 13  | Unit tests: HeartbeatClient success, backoff, unregister             | ✅ Met | 19 tests: register (4), heartbeats (7), stop (1), unregister (4), computeInterval (3).                                         |

---

## 2. Code Quality

### What's done well

- **Table-driven state machine** (`activity-tracker.ts`): Declarative, testable, matches spec exactly. Better than the spec's pseudocode which lacked source-state validation.
- **Factory functions with DI**: All modules accept injectable dependencies (`now`, `fetchFn`, `setInterval`, `exec`). Makes testing trivial without complex mock setups.
- **Single responsibility per file**: Each module does exactly one thing. File sizes are 40-100 lines: well within the 300-line budget.
- **Shared types used correctly**: Extension imports `ActivityStatus`, `RegisterBody`, `HeartbeatBody`, `ContextUsagePayload` from `@pi-fleet/shared`. No local redefinitions of shared concerns.
- **Error handling in entry point**: Every event handler in `index.ts` wraps logic in try/catch with `console.error`. Prevents one handler failure from crashing the extension or dropping events.
- **`timer.unref()`**: Prevents heartbeat timers from keeping the Node.js process alive. Good citizenship for an extension running inside another process.

### File-by-file notes

**`activity-tracker.ts`** (86 lines): Clean. Exports both the convenience methods (`onTurnStart()`) and generic `handleEvent()` for flexible wiring. `ActivitySnapshot` type correctly bundles state + timestamp for heartbeat payloads.

**`tmux-target.ts`** (38 lines): Properly injectable `Exec` type. Regex-based parsing handles the happy path; all error paths return null cleanly.

**`session-data.ts`** (62 lines): Getter-based interface exposes live data without mutation risk. `snapshot()` correctly converts `null` → `undefined` for optional heartbeat fields.

**`heartbeat-client.ts`** (107 lines): Well-structured with clear separation between `post()` helper, `scheduleNext()` loop, and public API.

**`index.ts`** (135 lines): Clean orchestration. Captures `extensionCtx` reference for later context usage reads. Refreshes tmux target on each heartbeat: a nice enhancement beyond minimum requirements.

---

## 3. Test Quality

### Strengths

- **Activity tracker tests are exhaustive**: Every valid transition (8), every invalid transition from every state (13), callback behavior, and timestamp updates. This is the exact coverage needed for a state machine.
- **Heartbeat tests use fake timers correctly**: `vi.advanceTimersByTimeAsync` exercises the full backoff progression without real delays.
- **Integration test (`index.test.ts`)** verifies actual payload assembly through the full event → module → HTTP chain. Mocks only the external boundary (fetch + child_process).
- **TmuxTarget tests cover all error paths**: Missing env, exec throws, non-zero exit, malformed output, empty output.

### No weak assertions found

Tests assert on specific values (exact URLs, parsed JSON bodies, state strings), not vague truths like "was called" without argument checks.

---

## 4. Issues

### 🟡 Should fix

**4.1: Non-null assertion on `sessionId`**

- **File:** `extension/src/index.ts`, line ~72 (inside heartbeat snapshot callback)
- **Problem:** `sessionId!` uses non-null assertion. While safe in the current flow (heartbeats only start after `sessionId` is set), this would mask bugs if code is refactored.
- **Fix:** Add a guard: `if (!sessionId) return { ... }` or assign sessionId before the callback closure captures it as a `const`.

**4.2: Registration failure doesn't prevent heartbeat start**

- **File:** `extension/src/index.ts`, lines ~55-68
- **Problem:** `client.register(...)` is awaited but its return value (boolean) is not checked. If the server is unreachable at startup, heartbeats start against a session the server doesn't know about. They'll repeatedly 404 and trigger backoff.
- **Fix:** Consider checking `const ok = await client.register(...)` and logging a warning if false. Heartbeats starting anyway is acceptable (resilient), but a log message helps debugging.

**4.3: Subprocess spawned every heartbeat for tmux target**

- **File:** `extension/src/index.ts`, heartbeat snapshot callback
- **Problem:** `captureTmuxTarget(process.env, exec)` spawns `tmux display-message` every 5s. At scale (many sessions), this is 12 subprocesses/minute/session.
- **Fix:** Consider only refreshing tmux target every N heartbeats (e.g., every 6th = every 30s), or only when the tmux env var changes. Not critical for the current scope but worth noting for production.

### 🟢 Nits

**4.4: `TmuxTarget` interface duplication**

- **File:** `extension/src/tmux-target.ts` vs `shared/src/types/terminal.ts`
- **Problem:** Extension defines its own `TmuxTarget` with `{session, window, pane, target}`. The shared package exports a `TmuxTarget` type too. They serve different purposes (internal parsed result vs shared API type) but the name collision could confuse readers.
- **Fix:** Rename the extension-local one to `ParsedTmuxTarget` or similar. Low priority.

**4.5: `computeInterval` exported for testing**

- **File:** `extension/src/heartbeat-client.ts`, last line
- **Problem:** `FAILURE_THRESHOLD`, `MAX_BACKOFF_MS`, and `computeInterval` are exported solely for unit tests. Exporting internals for testing is a mild code smell.
- **Fix:** Acceptable trade-off here since `computeInterval` is a pure function worth testing independently. No action needed.

**4.6: `buildMockPi` in index.test.ts is verbose**

- **File:** `extension/src/index.test.ts`, lines 18-55
- **Problem:** Large mock object with many `vi.fn()` stubs for unused API methods. Functional but noisy.
- **Fix:** Could extract to a shared test utility if more test files need it. Fine for now with only one integration test file.

---

## 5. Verdict

### ✅ Approve

All 13 acceptance criteria are met. The implementation is clean, well-tested (78 passing tests), type-safe (`tsc --noEmit` clean), and builds to a small bundle (9.45 kB). Design decisions are well-documented and justified.

The should-fix items (4.1-4.3) are real quality concerns but don't affect correctness for the defined acceptance criteria. They can be addressed in a follow-up pass or during the integration phase.

**Particularly good:**

- The table-driven state machine is more robust than the spec's pseudocode
- Dependency injection throughout enables thorough testing without mocking overhead
- Permission events via `pi.events` is a pragmatic solution that preserves extension decoupling
- Refreshing tmux target on heartbeat goes beyond requirements but improves accuracy
