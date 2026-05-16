# Changeset 2: Shared Types + Constants

**Ticket:** 02-shared-types
**Date:** 2026-05-15

## Summary

Implemented the complete shared type system for `@pi-fleet/shared`. All types, constants, and path utilities are defined and exported.

## Files

| Path                           | Action  | Purpose                                                                             |
| ------------------------------ | ------- | ----------------------------------------------------------------------------------- |
| `shared/src/types/session.ts`  | Created | ActivityStatus, ContextUsagePayload, RegisterBody, HeartbeatBody, RegisteredSession |
| `shared/src/types/pod.ts`      | Created | Pod interface, STATE_PRIORITY lookup                                                |
| `shared/src/types/cluster.ts`  | Created | ClusterDefinition, ClusterConfig                                                    |
| `shared/src/types/config.ts`   | Created | PiFleetConfig                                                                       |
| `shared/src/types/events.ts`   | Created | SSEEvent discriminated union (13 types)                                             |
| `shared/src/types/terminal.ts` | Created | TmuxTarget, OpenResult, OpenFailureReason                                           |
| `shared/src/constants.ts`      | Created | SERVER_PORT, HEARTBEAT_INTERVAL_MS, REAP_TIMEOUT_MS, SSE_KEEPALIVE_MS               |
| `shared/src/paths.ts`          | Created | getConfigDir, getConfigPath, getLogDir, getLogPath                                  |
| `shared/src/index.ts`          | Created | Barrel re-exports                                                                   |
| `shared/src/constants.test.ts` | Created | Constant value tests                                                                |
| `shared/src/paths.test.ts`     | Created | Path resolution tests                                                               |
| `shared/src/index.test.ts`     | Created | Export verification + type contract tests                                           |
| `shared/vitest.config.ts`      | Created | Test config                                                                         |
| `shared/tsconfig.json`         | Created | TS config extending monorepo base                                                   |
| `shared/package.json`          | Created | Package definition                                                                  |

## Verification

- `tsc --noEmit`: passes
- `vitest run`: 26 tests pass (3 files)
- `turbo build --filter=@pi-fleet/shared`: passes
- Runtime import verification: all exports resolve correctly
