# Changeset 11: Desktop Chrome: Overlay, Ghost Mode, Tray, Sound

**Ticket:** #11
**Date:** 2026-05-15
**Status:** ✅ Complete

## Summary

Implemented the full Electron main process for pi-fleet: menu-bar overlay window, F5 global shortcut, ghost mode (translucent + click-through), system tray with menu items, sound alerts on attention transitions, app config persistence, preload context bridge, and embedded server lifecycle with port conflict handling.

## Files Created

| Path | Purpose |
|------|---------|
| `desktop/src/config.ts` | Config load/save/manager with debounced auto-persistence |
| `desktop/src/config.test.ts` | Unit tests for config persistence |
| `desktop/src/window.ts` | BrowserWindow manager: overlay positioning, ghost mode, visibility toggle |
| `desktop/src/window.test.ts` | Unit tests for window manager |
| `desktop/src/tray.ts` | System tray icon and context menu (Show/Hide, Ghost, Sound, Quit) |
| `desktop/src/sound.ts` | Sound alert manager with per-session state deduplication |
| `desktop/src/sound.test.ts` | Unit tests for sound manager |
| `desktop/src/server.ts` | Embedded server lifecycle with port conflict dialog + retry |
| `desktop/src/server.test.ts` | Unit tests for embedded server |
| `desktop/src/preload.ts` | Context bridge: `window.piFleet` API (6 methods) |
| `desktop/assets/trayTemplate.png` | Placeholder tray template icon (16x16) |

## Files Modified

| Path | Change |
|------|--------|
| `desktop/src/main.ts` | Complete rewrite: app lifecycle, IPC handlers, shortcut registration, sound wiring, graceful shutdown |
| `desktop/tsdown.config.ts` | Added `preload.ts` as separate CJS entry point |

## Architecture

```
main.ts (orchestrator)
  ├── config.ts (createConfigManager)
  ├── server.ts (createEmbeddedServer)
  ├── window.ts (createWindowManager)
  ├── tray.ts (createTrayManager)
  ├── sound.ts (createSoundManager)
  ├── preload.ts (context bridge, separate build entry)
  └── ipc-open-session.ts (existing, unchanged)
```

## Key Design Decisions

1. **Sound via `shell.beep()`**: Simple, no asset dependency. Upgradable later.
2. **State-based dedup**: Compares current vs previous state per session (not timestamp). Fires once per transition.
3. **Debounced config save (500ms)**: Prevents disk thrash; synchronous flush on dispose.
4. **Server-first lifecycle**: Embedded server starts before BrowserWindow creation.
5. **Recursive retry on port conflict**: User can retry indefinitely via dialog without app restart.

## Verification

- Types: `tsc --noEmit` passes cleanly
- Tests: 79 passing across 6 test files (422ms)
- Build: `tsdown` produces both `main.cjs` and `preload.cjs`

## Commits

```
95f0176 feat(desktop): wire up full Electron main process lifecycle
dc035af feat(desktop): add preload context bridge (window.piFleet)
365d645 feat(desktop): add embedded server with port conflict handling
5720380 feat(desktop): add sound alerts for attention transitions
69e117e feat(desktop): add system tray with menu items
64a3ff8 feat(desktop): add BrowserWindow manager with ghost mode
6b57fc2 feat(desktop): add config persistence with load/save/manager
```
