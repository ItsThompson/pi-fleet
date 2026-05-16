### Ticket 2: Shared Types + Constants

**Type:** AFK
**Blocked by:** None — can start immediately
**User stories:** US-DATA-01, US-DATA-02

#### What to build

Define the shared type system in `@pi-fleet/shared`. This package provides the canonical types, constants, and path utilities used by every other package. It includes: `ActivityStatus` enum, `RegisteredSession`, `ContextUsagePayload`, `HeartbeatBody`, `RegisterBody`, `Pod`, `PodState`, `ClusterDefinition`, `ClusterConfig`, `PiFleetConfig`, `SSEEvent` discriminated union, `OpenResult`, `OpenFailureReason`, `TmuxTarget`. Also define constants (server port `8314`, heartbeat interval `5000ms`, reap timeout `15000ms`, SSE keep-alive `30000ms`) and path utilities for config/log file locations.

#### Acceptance criteria

- [ ] `shared/src/types/session.ts` exports `ActivityStatus`, `RegisteredSession`, `RegisterBody`, `HeartbeatBody`, `ContextUsagePayload`
- [ ] `shared/src/types/pod.ts` exports `Pod` with `leadSessionId`, `memberSessionIds`, `displayName`, `state`, `attentionCount`
- [ ] `shared/src/types/cluster.ts` exports `ClusterDefinition`, `ClusterConfig`
- [ ] `shared/src/types/config.ts` exports `PiFleetConfig` with version field and preferences
- [ ] `shared/src/types/events.ts` exports `SSEEvent` discriminated union covering all 12 event types from spec section 09
- [ ] `shared/src/types/terminal.ts` exports `TmuxTarget`, `OpenResult`, `OpenFailureReason`
- [ ] `shared/src/constants.ts` exports `SERVER_PORT`, `HEARTBEAT_INTERVAL_MS`, `REAP_TIMEOUT_MS`, `SSE_KEEPALIVE_MS`
- [ ] `shared/src/paths.ts` exports `getConfigPath()`, `getLogPath()` resolving to macOS standard locations
- [ ] `shared/src/index.ts` re-exports all public types and constants
- [ ] Package builds cleanly and is importable by other workspace packages

#### Technical notes

- All types are interfaces or type aliases: no runtime code except constants and path resolution.
- `ActivityStatus` is a string union, not an enum (better tree-shaking, aligns with Zod inference).
- `SSEEvent` uses a `type` discriminant for narrowing: `{ type: "session:added"; data: RegisteredSession }`.
- Config paths: `~/Library/Application Support/PiFleet/config.json`, logs: `~/Library/Logs/PiFleet/pi-fleet.log`.

---

## Completion Summary

**Status:** ✅ Complete
**Completed:** 2026-05-15

### Acceptance Criteria

- ✅ `shared/src/types/session.ts` exports `ActivityStatus`, `RegisteredSession`, `RegisterBody`, `HeartbeatBody`, `ContextUsagePayload`
- ✅ `shared/src/types/pod.ts` exports `Pod` with `leadSessionId`, `memberSessionIds`, `displayName`, `state`, `attentionCount`
- ✅ `shared/src/types/cluster.ts` exports `ClusterDefinition`, `ClusterConfig`
- ✅ `shared/src/types/config.ts` exports `PiFleetConfig` with version field and preferences
- ✅ `shared/src/types/events.ts` exports `SSEEvent` discriminated union covering all 13 event types from spec section 09 (spec defines 13, not 12: 3 session + 3 pod + 5 cluster + 2 system)
- ✅ `shared/src/types/terminal.ts` exports `TmuxTarget`, `OpenResult`, `OpenFailureReason`
- ✅ `shared/src/constants.ts` exports `SERVER_PORT`, `HEARTBEAT_INTERVAL_MS`, `REAP_TIMEOUT_MS`, `SSE_KEEPALIVE_MS`
- ✅ `shared/src/paths.ts` exports `getConfigPath()`, `getLogPath()` resolving to macOS standard locations
- ✅ `shared/src/index.ts` re-exports all public types and constants
- ✅ Package builds cleanly and is importable by other workspace packages

### Changes

**Files created:**

- `shared/src/types/session.ts`: ActivityStatus union, ContextUsagePayload, RegisterBody, HeartbeatBody, RegisteredSession
- `shared/src/types/pod.ts`: Pod interface, STATE_PRIORITY constant
- `shared/src/types/cluster.ts`: ClusterDefinition, ClusterConfig interfaces
- `shared/src/types/config.ts`: PiFleetConfig interface
- `shared/src/types/events.ts`: SSEEvent discriminated union (13 types), SSEEventType helper
- `shared/src/types/terminal.ts`: TmuxTarget, OpenFailureReason, OpenResult
- `shared/src/constants.ts`: SERVER_PORT, HEARTBEAT_INTERVAL_MS, REAP_TIMEOUT_MS, SSE_KEEPALIVE_MS
- `shared/src/paths.ts`: getConfigDir, getConfigPath, getLogDir, getLogPath
- `shared/src/index.ts`: barrel re-exports
- `shared/src/constants.test.ts`: constant value assertions
- `shared/src/paths.test.ts`: path resolution assertions
- `shared/src/index.test.ts`: barrel export verification + type contract tests
- `shared/vitest.config.ts`: vitest configuration
- `shared/tsconfig.json`: TypeScript config extending monorepo base
- `shared/package.json`: @pi-fleet/shared package definition

### Commits

```
37d0a6e fix: add tsdown configs and passWithNoTests for turbo compatibility
31c2929 chore: initialize pi-fleet monorepo scaffold
```

Note: implementation was committed as part of the monorepo scaffold (concurrent Ticket 1 work).

### Test Results

```
 RUN  v4.1.6 /Users/thompsnt/Documents/pi-fleet/shared

 Test Files  3 passed (3)
      Tests  26 passed (26)
   Start at  21:03:27
   Duration  122ms
```

Typecheck: `tsc --noEmit` passes with no errors.

Runtime verification:

```
SERVER_PORT: 8314
HEARTBEAT_INTERVAL_MS: 5000
REAP_TIMEOUT_MS: 15000
SSE_KEEPALIVE_MS: 30000
STATE_PRIORITY: { processing: 1, running_tool: 2, idle: 3, pending_approval: 4 }
configPath: /Users/thompsnt/Library/Application Support/PiFleet/config.json
logPath: /Users/thompsnt/Library/Logs/PiFleet/pi-fleet.log
```

### Design Decisions

1. **SSEEvent has 13 types, not 12**: Spec section 09 defines 13 event types. The ticket text says "12" but the actual spec content lists 13 (including `heartbeat` keep-alive). Implemented all 13 per the spec.
2. **STATE_PRIORITY exported from pod.ts**: Co-located with Pod type since it's the aggregation logic's lookup table. Exported via barrel for server use.
3. **SSEEventType helper type**: Added `type SSEEventType = SSEEvent["type"]` for consumers that need the event type strings without the full union.
4. **getConfigDir/getLogDir exposed**: Exported directory-level paths alongside file paths, since other code (e.g., ensuring directories exist) will need them.
