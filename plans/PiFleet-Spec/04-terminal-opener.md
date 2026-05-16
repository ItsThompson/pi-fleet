# 04: Terminal Opener

## Overview

The terminal opener is the highest-priority fix in this epic. It handles the full flow: resolve session → validate pane → find client → switch tmux → activate terminal window.

## Current Issues (from pi-watch)

| #   | Severity | Issue                                                 | Root Cause                                                           |
| --- | -------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Critical | No window activation after tmux switch                | Missing `osascript` or process activation call                       |
| 2   | Critical | `list-clients` unscoped                               | Counts ALL clients on tmux server, not just target session's         |
| 3   | Medium   | Regex mismatch between extension and desktop parsers  | Extension uses `#S:#I.#P`, desktop regex expects `(.+):(\d+)\.(\d+)` |
| 4   | Medium   | `lastKnownTmuxTarget` fallback persists stale targets | Never cleared on switch failure                                      |
| 5   | Medium   | 5-second staleness window with no retry               | Single attempt, no feedback                                          |
| 6   | Medium   | No tmux server/socket targeting                       | Only works with default tmux server                                  |
| 7   | Medium   | No pane existence validation                          | Attempts switch to potentially dead panes                            |

## Architecture

```
User clicks "Open in terminal"
       │
       ▼
┌──────────────────────────┐
│ Client: useTerminalOpener│
│ IPC: pf:open-session     │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ Desktop/main.ts:         │
│ ipcMain.handle           │
│ → POST /api/open-terminal│
└────────────┬─────────────┘
             │ response: { tmuxTarget, terminalApp? }
             ▼
┌──────────────────────────────────────────────────┐
│ terminal-opener.ts                                │
│                                                  │
│  1. parseTmuxTarget(targetStr)                   │
│     → { session, window, pane } | null           │
│                                                  │
│  2. validatePane(target)                         │
│     → tmux has-session -t <session>              │
│     → tmux display -t <target> -p "#{pane_id}"  │
│                                                  │
│  3. listClients(target.session)                  │
│     → tmux list-clients -t <session> -F "..."   │
│     → classify: ok | no-client | multi-client    │
│                                                  │
│  4. switchClient(client, target)                 │
│     → tmux switch-client -c <client> -t <target>│
│                                                  │
│  5. activateTerminal(terminalApp)                │
│     → osascript -e 'activate application "..."'  │
└──────────────────────────────────────────────────┘
```

## Terminal App Detection

The opener needs to activate the correct terminal application. Strategy:

```
1. From scoped list-clients output, extract the client TTY
2. Use `lsof` or `ps` to find the process owning that TTY
3. Walk process tree to find the terminal app (iTerm2, Terminal, Alacritty, Kitty, WezTerm)
4. Fall back to activating the frontmost terminal app
```

Alternative (simpler, covers 90% of cases):

```
1. From tmux list-clients -t <session> -F "#{client_tty}"
2. Check known terminal apps in order: iTerm2, Terminal.app, Alacritty, Kitty, WezTerm
3. Activate the first one found running via osascript
```

## TypeScript Interface

```typescript
interface TmuxTarget {
	session: string;
	window: string;
	pane: string;
}

type OpenResult = { ok: true } | { ok: false; reason: OpenFailureReason };

type OpenFailureReason =
	| "not-in-tmux"
	| "invalid-target"
	| "pane-not-found"
	| "no-server"
	| "no-client"
	| "multi-client"
	| "switch-failed"
	| "activation-failed";

interface TerminalOpenerDeps {
	/** Execute a shell command. Injected for testability. */
	exec: (
		cmd: string,
		args: string[],
	) => Promise<{ stdout: string; stderr: string }>;
	/** Show a system notification. Injected for testability. */
	notify: (title: string, body: string) => void;
}
```

## Fix Details

### Fix 1: Window Activation

After successful `tmux switch-client`, run:

```typescript
async function activateTerminal(exec: ExecFn): Promise<boolean> {
	// Detect which terminal app owns the tmux client
	const terminalApp = await detectTerminalApp(exec);
	if (!terminalApp) return false;

	await exec("osascript", [
		"-e",
		`tell application "${terminalApp}" to activate`,
	]);
	return true;
}
```

### Fix 2: Scoped list-clients

Replace:

```typescript
// BEFORE (broken): counts all clients on the entire tmux server
await exec("tmux", ["list-clients", "-F", "#{client_name}"]);
```

With:

```typescript
// AFTER: scoped to target session only
await exec("tmux", [
	"list-clients",
	"-t",
	target.session,
	"-F",
	"#{client_name}",
]);
```

### Fix 3: Regex alignment

Extension sends `#S:#I.#P` format (e.g., `main:1.0`).
Desktop parser must accept non-numeric session names and window identifiers:

```typescript
// Handles: "my-session:1.0", "work:dev.2", "0:0.0"
const TARGET_RE = /^(.+):(.+)\.(\d+)$/;
```

### Fix 7: Pane validation

Before switching, verify the target exists:

```typescript
async function validatePane(
	target: TmuxTarget,
	exec: ExecFn,
): Promise<boolean> {
	const fullTarget = `${target.session}:${target.window}.${target.pane}`;
	const { code } = await exec("tmux", [
		"display-message",
		"-t",
		fullTarget,
		"-p",
		"",
	]);
	return code === 0;
}
```

## Error Handling

| Failure Mode                | User-Facing Behavior                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| No tmux target on session   | Notification: "Session was not started inside tmux"                                             |
| Pane no longer exists       | Notification: "Pane no longer exists"; clear stale target from registry                         |
| No tmux server              | Notification: "tmux server not running"                                                         |
| No client on target session | Notification: "No terminal attached to session 'X'"                                             |
| Multiple clients            | Notification: "Multiple terminals on session 'X'; detach extras"                                |
| Switch command fails        | Notification: "tmux switch failed: <stderr>"                                                    |
| Terminal activation fails   | Notification: "Could not bring terminal to foreground" (non-fatal: tmux switch still succeeded) |
