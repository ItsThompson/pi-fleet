# Changeset 4: Extension: Activity Tracker + Heartbeat Client

**Ticket:** `/Users/thompsnt/Desktop/PiFleet-Spec/tickets/04-extension-core.md`
**Status:** ✅ Complete
**Date:** 2026-05-15

## Files Created

| Path                                     | Purpose                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `extension/src/activity-tracker.ts`      | Table-driven state machine with 8 valid transitions per spec                       |
| `extension/src/activity-tracker.test.ts` | 29 tests: all valid transitions, all invalid transitions, callbacks, timestamps    |
| `extension/src/tmux-target.ts`           | Reads TMUX env var, runs `tmux display-message -p '#S:#I.#P'`                      |
| `extension/src/tmux-target.test.ts`      | 8 tests: happy path, missing env, exec failures, malformed output                  |
| `extension/src/session-data.ts`          | Collects model, turnCount, lastToolName, thinkingLevel, contextUsage               |
| `extension/src/session-data.test.ts`     | 13 tests: all data collection methods and snapshot assembly                        |
| `extension/src/heartbeat-client.ts`      | fetch-based HTTP client with register/heartbeat/unregister and exponential backoff |
| `extension/src/heartbeat-client.test.ts` | 19 tests: success path, backoff progression, cap, reset, network errors            |
| `extension/src/index.test.ts`            | 9 integration tests: event wiring, payload assembly, lifecycle                     |
| `extension/vitest.config.ts`             | Vitest configuration with @pi-fleet/shared alias                                   |

## Files Modified

| Path                     | Change                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `extension/src/index.ts` | Replaced empty export with full extension entry point wiring all modules to pi lifecycle hooks |

## Commits

```
18b88d2 feat(extension): wire extension entry point to pi lifecycle hooks
c0f417f feat(extension): add HeartbeatClient with backoff
e7909b0 feat(extension): add SessionDataCollector
eb4dbf3 feat(extension): add TmuxTarget resolver
e1b347c feat(extension): add ActivityTracker state machine
```

## Test Results

```
 RUN  v4.1.6 /Users/thompsnt/Documents/pi-fleet/extension

 Test Files  5 passed (5)
      Tests  78 passed (78)
   Start at  21:16:11
   Duration  154ms
```

- TypeScript: `tsc --noEmit` passes with no errors
- Build: `tsdown` produces `dist/index.mjs` (9.45 kB)
- Turbo pipeline: `turbo run build --filter=@pi-fleet/extension` passes (shared → extension)

## Design Decisions

1. **Table-driven state machine over class with counter**: Pi-watch uses a class with `runningTools` counter and `permissionStack`. The spec defines 8 exact transitions with invalid ones silently ignored. A declarative transition table is simpler, more testable, and matches the spec exactly.

2. **Factory functions over classes**: `createActivityTracker()`, `createHeartbeatClient()`, `createSessionDataCollector()` enable dependency injection without class ceremony and align with the spec's pseudocode.

3. **`fetch` over `node:http`**: Ticket specifies "HeartbeatClient is a plain fetch wrapper." Simpler API than pi-watch's `http.request` approach.

4. **Permission events via event bus**: Pi doesn't expose native `tool_permission_*` lifecycle events. Permission transitions wired to `pi-fleet:permission-requested/granted/denied` on `pi.events` (shared inter-extension bus), matching the pattern pi-watch uses.

5. **`session_shutdown` maps to spec's `session_end`**: Pi's actual lifecycle event is `session_shutdown`. Implementation uses the real API event name.

6. **Progressive exponential backoff**: After 3 failures, interval doubles each subsequent failure (5s → 10s → 20s → 30s cap). Resets to 5s on any success.
