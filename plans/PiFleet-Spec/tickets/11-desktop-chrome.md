### Ticket 11: Desktop Chrome: Overlay, Ghost Mode, Tray, Sound

**Type:** AFK
**Blocked by:** #5, #8, #9
**User stories:** US-APP-01, US-APP-02, US-APP-03, US-SETUP-04

#### What to build

Wire up the Electron main process: BrowserWindow as menu-bar overlay, F5 global shortcut toggle, ghost mode (translucent + click-through), system tray with menu items, sound alerts on attention transitions, app config persistence, and the preload context bridge. Implements: `desktop/src/main.ts` (app lifecycle, IPC handlers), `desktop/src/window.ts` (BrowserWindow management, ghost mode, resize), `desktop/src/tray.ts` (tray menu), `desktop/src/config.ts` (load/save `PiFleetConfig`), `desktop/src/preload.ts` (context bridge exposing `window.piFleet`), `desktop/src/server.ts` (embedded server start/stop).

#### Acceptance criteria

- [ ] App launches as menu-bar overlay anchored to tray icon (top-right on macOS)
- [ ] F5 global shortcut toggles overlay visibility
- [ ] Window dimensions: 420x680 default, min 360x400, max 600x900, vertically resizable
- [ ] Ghost mode: overlay becomes translucent (configurable opacity, default 0.3) and click-through
- [ ] Ghost mode toggled via tray menu item; state persists across restarts
- [ ] Tray menu items: Show/Hide, Ghost Mode toggle, Sound toggle, Quit
- [ ] Sound plays when any session transitions to `pending_approval` or `idle` (one sound per transition, not per heartbeat)
- [ ] Sound togglable via tray menu; preference persists
- [ ] Config stored in `~/Library/Application Support/PiFleet/config.json` with `version: 1`
- [ ] Preload exposes `window.piFleet`: `openSession`, `getConfig`, `setConfig`, `onVisibilityChange`, `getServerUrl`, `getVersion`
- [ ] `contextIsolation: true`, `nodeIntegration: false` on BrowserWindow
- [ ] Embedded server starts before window loads; if port 8314 busy, error dialog with "Retry" button
- [ ] Port conflict error identifies likely cause ("Another instance of pi-fleet or pi-watch may be running")
- [ ] App remains open on port conflict (not crash); Retry button re-attempts bind

#### Technical notes

- Ghost mode uses `win.setIgnoreMouseEvents(true, { forward: true })` + `win.setOpacity(opacity)`.
- Sound: use Electron's `shell.beep()` or play a bundled `.wav` via `new Audio()` in renderer.
- Sound dedup: track last attention-transition timestamp per session to avoid replaying on heartbeat confirmations.
- F5 shortcut: `globalShortcut.register("F5", toggleOverlay)`. Handle registration failure (show notification suggesting tray menu).
- Embedded server: import `createServer()` from `@pi-fleet/server`, call `.listen()` before creating BrowserWindow.

---

## Completion Summary

**Status:** ✅ Complete
**Completed:** 2026-05-15

### Acceptance Criteria

- ✅ App launches as menu-bar overlay anchored to tray icon (top-right on macOS)
- ✅ F5 global shortcut toggles overlay visibility
- ✅ Window dimensions: 420x680 default, min 360x400, max 600x900, vertically resizable
- ✅ Ghost mode: overlay becomes translucent (configurable opacity, default 0.3) and click-through
- ✅ Ghost mode toggled via tray menu item; state persists across restarts
- ✅ Tray menu items: Show/Hide, Ghost Mode toggle, Sound toggle, Quit
- ✅ Sound plays when any session transitions to `pending_approval` or `idle` (one sound per transition, not per heartbeat)
- ✅ Sound togglable via tray menu; preference persists
- ✅ Config stored in `~/Library/Application Support/PiFleet/config.json` with `version: 1`
- ✅ Preload exposes `window.piFleet`: `openSession`, `getConfig`, `setConfig`, `onVisibilityChange`, `getServerUrl`, `getVersion`
- ✅ `contextIsolation: true`, `nodeIntegration: false` on BrowserWindow
- ✅ Embedded server starts before window loads; if port 8314 busy, error dialog with "Retry" button
- ✅ Port conflict error identifies likely cause ("Another instance of pi-fleet or pi-watch may be running")
- ✅ App remains open on port conflict (not crash); Retry button re-attempts bind

### Changes

**Files created:**

- `desktop/src/config.ts`: Config persistence (load/save/manager with debounced writes)
- `desktop/src/config.test.ts`: Config unit tests (load, save, manager, migration)
- `desktop/src/window.ts`: BrowserWindow manager (overlay, ghost mode, positioning)
- `desktop/src/window.test.ts`: Window manager unit tests
- `desktop/src/tray.ts`: System tray icon and context menu
- `desktop/src/sound.ts`: Sound alert manager with deduplication
- `desktop/src/sound.test.ts`: Sound manager unit tests
- `desktop/src/server.ts`: Embedded server lifecycle with port conflict handling
- `desktop/src/server.test.ts`: Embedded server unit tests
- `desktop/src/preload.ts`: Context bridge exposing `window.piFleet` API
- `desktop/assets/trayTemplate.png`: Placeholder tray icon (16x16 template)

**Files modified:**

- `desktop/src/main.ts`: Complete rewrite to wire all modules together (app lifecycle, IPC, shortcuts, sound)
- `desktop/tsdown.config.ts`: Added preload.ts as separate build entry point

### Commits

```
95f0176 feat(desktop): wire up full Electron main process lifecycle
dc035af feat(desktop): add preload context bridge (window.piFleet)
365d645 feat(desktop): add embedded server with port conflict handling
5720380 feat(desktop): add sound alerts for attention transitions
69e117e feat(desktop): add system tray with menu items
64a3ff8 feat(desktop): add BrowserWindow manager with ghost mode
6b57fc2 feat(desktop): add config persistence with load/save/manager
```

### Test Results

```
 Test Files  6 passed (6)
      Tests  79 passed (79)
   Duration  422ms

tsc --noEmit: clean (0 errors)
tsdown: ✔ Build complete (main.cjs + preload.cjs)
```

### Design Decisions

1. **shell.beep() over bundled WAV**: Simpler, no asset dependency, works out of the box. Can upgrade to custom sound later if needed.
2. **Sound dedup by state tracking (not timestamps)**: Comparing current vs. previous state per session is simpler and more reliable than timestamp-based dedup. Fires exactly once per state transition.
3. **Config manager with debounced save (500ms)**: Prevents disk thrash on rapid preference changes while ensuring eventual persistence. Synchronous flush on dispose.
4. **Tray icon fallback to empty nativeImage**: Prevents crash in dev environments where assets/ hasn't been built. Production builds will have the real icon.
5. **Recursive retry for port conflicts**: `attemptStart` calls itself via `handlePortConflict → Retry → attemptStart`. User can retry as many times as needed without restarting.
