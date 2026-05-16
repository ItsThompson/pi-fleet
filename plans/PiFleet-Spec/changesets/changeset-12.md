# Changeset 12: E2E Smoke Tests + Polish

**Ticket:** #12
**Date:** 2026-05-15
**Commits:** e48ab2e, 59b301e

## Summary

Implemented full E2E smoke test suite (42 tests) covering all 6 spec scenarios plus empty state and polish. Added pi-watch conflict detection and enhanced the first-launch empty state experience.

## Changes

### E2E Test Suite (`e2e/`)

| File | Purpose |
|------|---------|
| `src/helpers/test-harness.ts` | Creates isolated server on random port with temp config |
| `src/helpers/mock-session.ts` | MockSession class: register, heartbeat, unregister |
| `src/helpers/index.ts` | Barrel export |
| `src/smoke-1-session-lifecycle.test.ts` | 7 tests: register, heartbeat, pods, unregister, metadata, terminal, SSE |
| `src/smoke-2-pod-formation.test.ts` | 5 tests: ownership, child/parent death, aggregation, deferred match |
| `src/smoke-3-cluster-management.test.ts` | 7 tests: CRUD, directory match, manual override, persistence, reorder |
| `src/smoke-4-attention-system.test.ts` | 6 tests: pod badges, cluster sums, approval clears, SSE, aggregation |
| `src/smoke-5-ghost-mode-sound.test.ts` | 4 tests: idle SSE, activity state, health, dedup contract |
| `src/smoke-6-dnd-reordering.test.ts` | 5 tests: reassign API, reorder, SSE, manual override durability |
| `src/empty-state-polish.test.ts` | 6 tests: zero sessions/clusters, pi-watch, first-session |
| `vitest.config.ts` | Test runner config (15s timeout) |
| `package.json` | Switched to vitest, added @pi-fleet/server dep |
| `tsconfig.json` | Simplified TS config |

### Server Changes

| File | Change |
|------|--------|
| `src/utils/pi-watch-detect.ts` | New: checks `~/.pi/agent/extensions/pi-watch` existence |
| `src/routes/health.ts` | Added `piWatchDetected` field to health response |

### Client Changes

| File | Change |
|------|--------|
| `src/hooks/useHealth.ts` | New: fetches health data for pi-watch detection |
| `src/components/layout/Header.tsx` | Added dismissable PiWatchNotice component |
| `src/components/layout/MainArea.tsx` | Enhanced EmptyState with full setup guide |

## Test Results

```
8/8 turbo tasks successful
Server: 150 tests passed
Client: 123 tests passed
E2E:    42 tests passed
Total:  315 tests, 0 failures
```

## Design Decisions

- **Vitest over Playwright**: Server-level integration tests are faster, CI-friendly, and cover the real behavior without Electron/tmux complexity.
- **MockSession class**: Programmatic control over session lifecycle for deterministic tests.
- **Pi-watch detection via filesystem**: Non-blocking check that works regardless of pi-watch runtime state.
- **Health endpoint bundling**: piWatchDetected in existing health response rather than a new endpoint.
