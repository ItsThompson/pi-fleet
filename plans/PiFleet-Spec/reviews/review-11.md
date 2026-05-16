# Review: Ticket 11 - Desktop Chrome: Overlay, Ghost Mode, Tray, Sound

**Reviewer:** automated
**Date:** 2026-05-15
**Build status:** ✅ `tsc --noEmit` clean, `tsdown` produces both entries, 6 test files / 79 tests pass

---

## 1. Acceptance Criteria Audit

| #   | Criterion                                                                              | Status | Notes                                                                                                                           |
| --- | -------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | App launches as menu-bar overlay anchored to tray icon (top-right on macOS)            | ✅ Met | `getAnchorPosition()` calculates x = screenWidth - width - 12, y = 0. `alwaysOnTop: true`, `skipTaskbar: true`, `frame: false`. |
| 2   | F5 global shortcut toggles overlay visibility                                          | ✅ Met | `globalShortcut.register("F5", ...)` in `main.ts` with failure notification fallback.                                           |
| 3   | Window dimensions: 420x680 default, min 360x400, max 600x900, vertically resizable     | ✅ Met | `WINDOW_DEFAULTS` matches spec. `resizable: true`.                                                                              |
| 4   | Ghost mode: translucent (configurable opacity, default 0.3) + click-through            | ✅ Met | `setIgnoreMouseEvents(true, { forward: true })` + `setOpacity(opacity)`. Default opacity 0.3.                                   |
| 5   | Ghost mode toggled via tray menu; persists across restarts                             | ✅ Met | Tray checkbox calls `windowManager.setGhostMode()` which calls `configManager.set("ghostMode", ...)`. Config loaded on startup. |
| 6   | Tray menu items: Show/Hide, Ghost Mode toggle, Sound toggle, Quit                      | ✅ Met | All four items present in `tray.ts` menu template with correct types (checkbox for toggles).                                    |
| 7   | Sound plays on transition to `pending_approval` or `idle` (once per transition)        | ✅ Met | `SoundManager.handleStateChange` fires only when `ATTENTION_STATES.has(activity) && previousState !== activity`.                |
| 8   | Sound togglable via tray menu; preference persists                                     | ✅ Met | Tray checkbox for Sound calls `configManager.set("soundEnabled", ...)`.                                                         |
| 9   | Config stored in `~/Library/Application Support/PiFleet/config.json` with `version: 1` | ✅ Met | Uses `getConfigPath()` from shared, schema has `version: 1`.                                                                    |
| 10  | Preload exposes `window.piFleet`: all 6 methods                                        | ✅ Met | `contextBridge.exposeInMainWorld("piFleet", {...})` with all required methods.                                                  |
| 11  | `contextIsolation: true`, `nodeIntegration: false`                                     | ✅ Met | Explicitly set in `webPreferences`. Test verifies this.                                                                         |
| 12  | Embedded server starts before window loads; port conflict shows "Retry" dialog         | ✅ Met | `server.start()` called before `windowManager.createWindow()`. Dialog with Retry/Quit buttons.                                  |
| 13  | Port conflict error identifies likely cause                                            | ✅ Met | Detail string: "Another instance of pi-fleet or pi-watch may be running"                                                        |
| 14  | App remains open on port conflict; Retry re-attempts bind                              | ✅ Met | `attemptStart` recurses via `handlePortConflict`. App doesn't crash: tray is created for graceful quit.                         |

**All 14 acceptance criteria met.**

---

## 2. Code Quality

### Overall Assessment

Strong implementation with clean module boundaries, proper dependency injection, and consistent patterns. Each module has a single responsibility and exports a factory function accepting deps.

### Naming

- ✅ Factory functions follow `create*` convention: `createConfigManager`, `createWindowManager`, `createTrayManager`, `createSoundManager`, `createEmbeddedServer`.
- ✅ Interfaces named after their role: `WindowManager`, `TrayManager`, `SoundManager`, `ConfigManager`.
- ✅ Constants are descriptive: `WINDOW_DEFAULTS`, `ATTENTION_STATES`, `TERMINAL_APP_ALLOWLIST`.

### Structure

- ✅ Every module under 150 LOC. Clean decomposition.
- ✅ Main.ts acts as a composition root, wiring modules together.
- ✅ Preload.ts is minimal surface area (as spec requires).

### Type Safety

- ✅ `PiFleetConfig` shared type used consistently across packages.
- ✅ `satisfies PiFleetBridge` in preload.ts enforces the contract at compile time.
- ✅ No `any` types anywhere.
- 🟡 `config.ts` line 80: `set()` accepts `unknown` value without runtime type validation (see Issues).

### Error Handling

- ✅ Server start failures handled gracefully: app stays open, tray created for Quit.
- ✅ F5 shortcut registration failure: shows notification suggesting tray menu.
- ✅ Config load failure: returns safe defaults.
- ✅ Missing tray icon: falls back to empty nativeImage.

### Patterns

- ✅ Consistent with the dependency injection pattern from `terminal-opener.ts` (prior ticket).
- ✅ IPC channels use `pf:` prefix per spec (09-communication-interfaces.md).
- ✅ Config debounce at 500ms per spec (10-nonfunctional.md performance requirements).

---

## 3. Test Quality

### Coverage

| Module       | Test file        | Tests | Assessment                                                                   |
| ------------ | ---------------- | ----- | ---------------------------------------------------------------------------- |
| `config.ts`  | `config.test.ts` | 11    | ✅ Thorough: load, save, manager, migration, edge cases                      |
| `window.ts`  | `window.test.ts` | 10    | ✅ Good: dimensions, positioning, ghost mode, visibility, security           |
| `sound.ts`   | `sound.test.ts`  | 9     | ✅ Excellent: dedup logic, transitions, per-session tracking, disabled state |
| `server.ts`  | `server.test.ts` | 6     | ✅ Good: startup, port conflict, retry, generic errors, stop                 |
| `tray.ts`    | _(none)_         | 0     | 🟡 Missing tests (see Issues)                                                |
| `preload.ts` | _(none)_         | 0     | Acceptable: thin bridge, hard to unit-test in isolation                      |
| `main.ts`    | _(none)_         | 0     | Acceptable: composition root, tested via integration                         |

### Strengths

- Tests verify behavior through public interfaces (not internals).
- Sound tests cover the critical dedup logic: repeated heartbeats, re-transitions, per-session independence.
- Config tests use real filesystem (temp dirs): sociable tests, not mocking fs.
- Server tests correctly mock external boundaries (electron dialog, @pi-fleet/server).
- Window tests validate the security-critical properties (contextIsolation, nodeIntegration).

### Concerns

- `sound.test.ts`: The `dispose()` test doesn't assert behavior (comment says "no assertion needed"). After dispose, a call to `handleStateChange` with a previously-seen session should re-fire sound (since state was cleared). Adding this assertion would actually validate dispose works.

---

## 4. Issues

### 🟡 Should Fix

**4.1: No unit tests for `tray.ts`**

- **File:** `desktop/src/tray.ts`
- **Problem:** The tray module contains non-trivial logic: menu construction with dynamic Show/Hide label, checkbox state from config, click handlers that wire to other managers. Zero test coverage.
- **Impact:** Regressions in menu wiring (e.g., ghost mode checkbox not calling `setGhostMode`) would go undetected.
- **Fix:** Add `tray.test.ts` with mocked Electron `Tray`/`Menu` verifying: menu template structure, click handlers invoke correct methods, updateMenu reflects current state.

**4.2: Preload hardcodes server port instead of using shared constant**

- **File:** `desktop/src/preload.ts`, line 43
- **Problem:** `getServerUrl()` returns a hardcoded string `http://127.0.0.1:8314` rather than importing `SERVER_PORT` from `@pi-fleet/shared`.
- **Impact:** If `SERVER_PORT` changes in shared, preload will be out of sync. Violates single source of truth.
- **Fix:** Import `SERVER_PORT` from `@pi-fleet/shared` and use it: `return \`http://127.0.0.1:${SERVER_PORT}\``.

**4.3: SoundManager `lastState` map grows unbounded**

- **File:** `desktop/src/sound.ts`, line 31
- **Problem:** Sessions are tracked in `lastState` map but never removed when a session unregisters. Over a long-running app lifetime with many sessions, this map grows indefinitely.
- **Impact:** Minor memory leak. Unlikely to be problematic in practice (sessions are lightweight strings), but violates clean resource management.
- **Fix:** Add a `removeSession(sessionId: string)` method and wire it to the `session:removed` event in `main.ts`'s `wireSessionSoundAlerts`.

**4.4: ConfigManager `set()` accepts any value type without validation**

- **File:** `desktop/src/config.ts`, line 80
- **Problem:** `set(key: string, value: unknown)` only checks the key exists in `preferences` but doesn't validate the value type. Callers could store `"banana"` for `ghostOpacity` (a number field) or `42` for `ghostMode` (a boolean field).
- **Impact:** Invalid config values could persist to disk and cause runtime errors on next load (though `loadConfig` would fall back to defaults on parse failure).
- **Fix:** Add a validation map or use the `PiFleetConfig` type to narrow accepted values per key. At minimum, validate `typeof value` matches expected type.

### 🟢 Nit

**4.5: Window positioning assumes menu bar is at top**

- **File:** `desktop/src/window.ts`, line 34
- **Problem:** `y: 0` works on macOS (menu bar at top), but the comment says "anchored near tray" without accounting for menu bar height (~25px). Window might overlap the menu bar slightly.
- **Impact:** Cosmetic only. Electron may auto-adjust. Not a bug per spec ("top-right on macOS").
- **Fix:** Consider using `primaryDisplay.workArea.y` as the y-offset to account for menu bar height.

**4.6: `sound.test.ts` dispose test has no meaningful assertion**

- **File:** `desktop/src/sound.test.ts`, lines 111-119
- **Problem:** The dispose test only calls dispose and verifies no error is thrown. It doesn't assert observable behavior (e.g., that a re-transition after dispose fires sound again, proving state was cleared).
- **Fix:** After dispose, call `handleStateChange` for a session that was previously tracked and assert sound fires (proving the dedup state was reset).

**4.7: Config test uses `require("node:fs")` inconsistently**

- **File:** `desktop/src/config.test.ts`, lines 31, 42, 53, 60
- **Problem:** Tests import `{ writeFileSync }` at top via `import` but then use `require("node:fs").writeFileSync` in test bodies. Inconsistent.
- **Fix:** Use the already-imported `writeFileSync` from the top-level import, or add `writeFileSync` to the existing import from `node:fs`.

---

## 5. Verdict

### ✅ Approve

All 14 acceptance criteria are met. The implementation is well-structured with clean module boundaries, proper security configuration, and solid test coverage for the critical paths (sound dedup, config persistence, port conflict handling, ghost mode). The design decisions documented in the completion summary (shell.beep over WAV, state-based dedup, debounced config) are sensible and well-executed.

The "should fix" items are genuine improvements but none are blocking: the missing tray tests are a gap, the hardcoded port is a maintainability concern, and the unbounded map is a theoretical leak. All can be addressed in a follow-up without risk to the current functionality.
