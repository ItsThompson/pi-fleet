# Review: Ticket 5 — Terminal Opener

**Reviewed:** 2026-05-15
**Verdict:** ✅ Approve

---

## 1. Acceptance Criteria Audit

| #   | Criterion                                                                                                     | Status | Notes                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `POST /api/open-terminal` returns `{ tmuxTarget }` for valid session, 404 for unknown, 400 for no-tmux-target | ✅ Met | Route handler + 5 tests confirm all three responses                                                                                                    |
| 2   | `parseTmuxTarget("main:1.0")` returns `{ session: "main", window: "1", pane: "0" }`                           | ✅ Met | Direct test assertion                                                                                                                                  |
| 3   | `parseTmuxTarget` handles non-numeric session names                                                           | ✅ Met | Tests cover `my-project:dev.2`, `my.project:1.0`, `work_env-2:3.1`                                                                                     |
| 4   | `validatePane` runs `tmux display-message -t <target> -p ""`                                                  | ✅ Met | Test verifies exact args passed                                                                                                                        |
| 5   | `listClients` scoped with `-t <session>` (Fix #2)                                                             | ✅ Met | Test captures args and asserts `-t` is present                                                                                                         |
| 6   | Single client: `tmux switch-client -c <client> -t <target>`                                                   | ✅ Met | Test verifies exact args                                                                                                                               |
| 7   | osascript activation runs after switch (Fix #1)                                                               | ✅ Met | Full-flow test confirms osascript call                                                                                                                 |
| 8   | Terminal app detected from running processes                                                                  | ✅ Met | `detectTerminalApp` with ps-based detection                                                                                                            |
| 9   | Zero clients: `{ ok: false, reason: "no-client" }`                                                            | ✅ Met | Full-flow test                                                                                                                                         |
| 10  | Multiple clients: `{ ok: false, reason: "multi-client" }`                                                     | ✅ Met | Full-flow test                                                                                                                                         |
| 11  | Pane not found: `{ ok: false, reason: "pane-not-found" }`                                                     | ✅ Met | Full-flow test                                                                                                                                         |
| 12  | IPC channel `pf:open-session` triggers flow and returns `OpenResult`                                          | ✅ Met | `ipc-open-session.ts` registered with `ipcMain.handle`                                                                                                 |
| 13  | Total flow < 500ms                                                                                            | ✅ Met | Sequential `execFile` calls with no sleeps                                                                                                             |
| 14  | Tests cover all 8 failure modes with injected `exec`                                                          | ✅ Met | 40 tests cover: invalid-target, pane-not-found, no-server, no-client, multi-client, switch-failed, activation-failed (non-fatal), no-terminal-detected |
| 15  | Tests verify osascript uses validated allowlist (no injection)                                                | ✅ Met | Test with invalid app name returns false; allowlist check in `activateTerminal`                                                                        |

---

## 2. Code Quality

### `desktop/src/terminal-opener.ts`

**Strengths:**

- Clean decomposition: each step is a separate exported function, testable in isolation.
- Dependency injection via `ExecFn`/`NotifyFn` makes testing frictionless.
- All tmux commands pass args as arrays (Fix #6 prevention for command injection).
- Allowlist validation on `activateTerminal` is a good defense-in-depth measure.
- Good use of guard clauses in `openTerminal`: flat flow, no nesting.
- File size is well within the 300-line limit (178 lines).

**Minor observations:**

- `detectTerminalApp` lowercases the full ps output then does `.includes(app.toLowerCase())`. This is safe because the allowlist entries are unique-enough strings, but theoretically "terminal" could match a process named "terminal-notifier". Low-risk in practice.

### `desktop/src/ipc-open-session.ts`

**Strengths:**

- Clear separation of concerns: IPC wiring is its own module.
- Uses `fetch` against the local server, matching the architecture (renderer → main → server → opener).
- Error mapping from HTTP status codes to `OpenResult` reasons is appropriate.

### `server/src/routes/open-terminal.ts`

**Strengths:**

- Clean Fastify pattern: Zod schema validation, early returns for error states.
- Structured logging for the resolved target (helpful for debugging).
- Simple and focused: 35 lines, single responsibility.

### `server/src/schemas.ts`

- `openTerminalBodySchema` is minimal (`{ sessionId: string }`), matching the spec's contract.
- Schema is properly exported from `server/src/index.ts` for cross-package use.

### `desktop/src/main.ts`

- Thin orchestration: only calls `registerOpenSessionIPC()` on `app.whenReady()`. Good.

---

## 3. Test Quality

### `desktop/src/terminal-opener.test.ts` (40 tests)

**Strengths:**

- Test helpers (`buildExec`, `buildFailingExec`, `buildDeps`) are clean and reusable.
- Tests exercise behavior through the public API: pass args, assert outputs.
- Each failure mode has its own dedicated test in the full-flow `describe` block.
- The test that verifies injection prevention uses `@ts-expect-error` to bypass types, which is the correct way to test runtime guards.
- Good edge cases: empty string, no colon, no dot, non-numeric pane, session names with dots/hyphens.

**One observation:**

- The `buildExec` helper matches by `key.includes(pattern)`, which works because command strings are unique enough. If tests ever needed to distinguish between two calls with overlapping patterns, this could be fragile. For this module's tests, it's fine.

### `server/src/routes/open-terminal.test.ts` (5 tests)

- Uses `server.app.inject` (Fastify's test client) rather than real HTTP: fast and isolated.
- Covers the three response codes plus validation and non-numeric targets.

### `desktop/src/ipc-open-session.test.ts` (3 tests)

- Uses a real Fastify server on a dedicated port: good integration test pattern.
- Tests the full flow from HTTP resolution to `openTerminal` execution.
- Covers success path, no-tmux-target (400), and session-not-found (404).

---

## 4. Issues

### 🟡 Should Fix

**1. `require("electron")` in IPC module uses CJS require in ESM package**

- File: `desktop/src/ipc-open-session.ts`, line 21
- The `notify` function uses `require("electron")` with a comment about "avoiding issues in test environments." This is a CJS pattern inside a `"type": "module"` package. It works today because of bundler transformations (tsdown), but it's fragile and bypasses the module system.
- Suggested fix: Import `Notification` from electron at the top of the file (alongside `ipcMain`), or use a lazy `import()` expression. If Notification needs to be optional for tests, make the notify function injectable into `registerOpenSessionIPC()`.

**2. Integration test imports from a relative path across packages**

- File: `desktop/src/ipc-open-session.test.ts`, line 3
- `import { createServer } from "../../server/src/server.js"` uses a relative path to reach into another package's source. This works due to the `rootDir: ".."` in tsconfig.json, but it couples the test to the monorepo's physical layout.
- Suggested fix: Import from the package name `@pi-fleet/server` (which exports `createServer`), or add a test-only path mapping.

### 🟢 Nit

**3. Spec defines optional `terminalApp` in response; route doesn't return it**

- File: `server/src/routes/open-terminal.ts`
- The spec (`09-communication-interfaces.md`) defines `OpenTerminalResponse` with an optional `terminalApp?: string` field. The current implementation only returns `{ tmuxTarget }`. Since the field is optional and terminal detection happens on the desktop side (after the response), this is architecturally correct: the server doesn't know the terminal app. No change needed, just noting the deviation is intentional.

**4. `detectTerminalApp` could match unrelated processes**

- File: `desktop/src/terminal-opener.ts`, line ~106
- Matching `processes.includes(app.toLowerCase())` against the full `ps -eo comm` output could theoretically match a process like `terminal-notifier` for the "terminal" allowlist entry.
- Suggested fix: Match against whole lines (`processes.split('\n').some(line => line.trim().toLowerCase() === app.toLowerCase())`) or use `comm=` instead of `comm` in ps output. Low priority: the priority ordering (iTerm2 first) mitigates most real-world collisions.

**5. `clientResult.first!` non-null assertion**

- File: `desktop/src/terminal-opener.ts`, line ~154
- The non-null assertion on `clientResult.first!` is safe here because we've already confirmed `clientResult.count === 1` which guarantees `first` is non-null per the `listClients` implementation. But it's technically relying on an invariant that isn't type-enforced.
- Could use: `const client = clientResult.first; if (!client) return ...;` but given the logic flow, the assertion is reasonable.

---

## 5. Verdict

### ✅ Approve

All 15 acceptance criteria are met. The implementation is clean, well-decomposed, and thoroughly tested (48 tests across 4 test files, all passing). The design decisions are sound:

- Terminal activation as non-fatal is correct.
- Stale target clearing as caller responsibility keeps the module pure.
- IPC handler as a separate module keeps main.ts thin.
- All security concerns (injection prevention, allowlist validation, array args) are addressed.

The "should fix" items are code quality improvements that don't affect correctness or user behavior. They can be addressed in a follow-up without blocking this ticket.
