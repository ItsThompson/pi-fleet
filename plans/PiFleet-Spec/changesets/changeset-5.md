# Changeset 5: Terminal Opener

**Ticket:** `/Users/thompsnt/Desktop/PiFleet-Spec/tickets/05-terminal-opener.md`
**Status:** ✅ Complete
**Date:** 2026-05-15

## Files Created

| Path | Purpose |
|------|---------|
| `server/src/routes/open-terminal.ts` | POST /api/open-terminal route: resolves session to tmux target |
| `server/src/routes/open-terminal.test.ts` | 5 tests: valid session, 404, 400, validation, non-numeric names |
| `desktop/src/terminal-opener.ts` | Core module: parse → validate → list-clients → switch → activate |
| `desktop/src/terminal-opener.test.ts` | 40 tests: all parsing, validation, client classification, and failure modes |
| `desktop/src/ipc-open-session.ts` | IPC handler: wires renderer pf:open-session to server + opener |
| `desktop/src/ipc-open-session.test.ts` | 3 integration tests: full flow via real server |
| `desktop/tsconfig.build.json` | Build-only tsconfig excluding test files |

## Files Modified

| Path | Change |
|------|--------|
| `desktop/src/main.ts` | Wires IPC handler on app.whenReady() |
| `desktop/package.json` | Build script uses tsconfig.build.json |
| `desktop/tsconfig.json` | rootDir adjusted for cross-package test imports |
| `server/src/index.ts` | Export openTerminalBodySchema |

## Commits

```
1e663f0 feat(server): implement POST /api/open-terminal route
2bd7343 feat(desktop): implement terminal-opener with all 7 pi-watch fixes
faa3cfe feat(desktop): wire pf:open-session IPC channel
be27841 chore(desktop): add tsconfig.build.json to exclude test files from build
84b4a7d chore(server): export openTerminalBodySchema from index
```

## Test Results

```
@pi-fleet/shared:    Test Files  3 passed (3) | Tests  26 passed (26)
@pi-fleet/server:    Test Files  7 passed (7) | Tests  84 passed (84)
@pi-fleet/desktop:   Test Files  2 passed (2) | Tests  43 passed (43)
@pi-fleet/client:    Test Files  7 passed (7) | Tests  46 passed (46)
@pi-fleet/extension: Test Files  6 passed (6) | Tests  85 passed (85)
Tasks: 7 successful, 7 total
```

Type checking passes for all packages (`tsc --noEmit`).

## pi-watch Bug Fixes

| # | Fix | Implementation |
|---|-----|----------------|
| 1 | Window activation after tmux switch | `activateTerminal()` runs osascript after successful switch |
| 2 | list-clients scoped to session | `listClients()` uses `-t <session>` flag |
| 3 | Regex mismatch (non-numeric names) | Regex: `/^(.+):(.+)\.(\d+)$/` accepts any session/window name |
| 4 | Stale target persistence | `pane-not-found` result signals caller to clear stale target |
| 5 | No feedback on failure | All failure modes produce user notifications via injected notify |
| 6 | Shell interpolation risk | All tmux commands use execFile with args arrays, never shell |
| 7 | No pane existence validation | `validatePane()` runs `tmux display-message -t <target> -p ""` |

## Design Decisions

1. **Terminal activation is non-fatal:** osascript failure after successful tmux switch still returns `{ ok: true }`. The pane was switched; failing to bring the window to front is a UX degradation, not a failure.

2. **Stale target clearing is caller responsibility:** `openTerminal` returns `pane-not-found` but doesn't directly clear the registry. Keeps the opener module pure (no server dependency).

3. **detectTerminalApp uses ps over lsof/process-tree:** Simpler approach (check running processes against allowlist in priority order) that covers 90%+ of cases.

4. **IPC handler separated from main.ts:** `ipc-open-session.ts` is a standalone module. Keeps `main.ts` thin, allows independent testing.

5. **Integration test uses real server:** IPC integration test starts a real Fastify server on a non-conflicting port to test the full flow without mocking HTTP.
