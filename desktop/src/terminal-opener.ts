import type { TmuxTarget, OpenResult } from "@pi-fleet/shared";

/** Allowlist of terminal apps safe for osascript activation */
export const TERMINAL_APP_ALLOWLIST = [
	"iTerm2",
	"Terminal",
	"Alacritty",
	"kitty",
	"WezTerm",
] as const;

export type TerminalApp = (typeof TERMINAL_APP_ALLOWLIST)[number];

export type ExecFn = (
	cmd: string,
	args: string[],
) => Promise<{ stdout: string; stderr: string }>;

export type NotifyFn = (title: string, body: string) => void;

export interface TerminalOpenerDeps {
	exec: ExecFn;
	notify: NotifyFn;
}

/**
 * Parse a tmux target string (format: "session:window.pane").
 * Fix #3: Accepts non-numeric session names and window identifiers.
 */
export function parseTmuxTarget(raw: string): TmuxTarget | null {
	// Format: session:window.pane
	// Session can be anything (including hyphens, dots in name)
	// Window can be non-numeric (e.g., "dev")
	// Pane is always numeric
	const match = raw.match(/^(.+):(.+)\.(\d+)$/);
	if (!match) return null;
	return { session: match[1], window: match[2], pane: match[3] };
}

/**
 * Format a TmuxTarget back to the "session:window.pane" string.
 */
export function formatTarget(target: TmuxTarget): string {
	return `${target.session}:${target.window}.${target.pane}`;
}

/**
 * Validate that the target pane exists in tmux.
 * Fix #7: Prevents switching to dead panes.
 */
export async function validatePane(
	target: TmuxTarget,
	exec: ExecFn,
): Promise<boolean> {
	const fullTarget = formatTarget(target);
	try {
		await exec("tmux", ["display-message", "-t", fullTarget, "-p", ""]);
		return true;
	} catch {
		return false;
	}
}

/**
 * List tmux clients scoped to the target session.
 * Fix #2: Uses `-t <session>` to avoid counting unrelated clients.
 */
export async function listClients(
	session: string,
	exec: ExecFn,
): Promise<{ count: number; first: string | null }> {
	const { stdout } = await exec("tmux", [
		"list-clients",
		"-t",
		session,
		"-F",
		"#{client_name}",
	]);

	const clients = stdout.split(/\r?\n/).filter((line) => line.trim() !== "");

	return { count: clients.length, first: clients[0] ?? null };
}

/**
 * Switch the tmux client to the target pane.
 * All args are passed as array elements to execFile (Fix #6 prevention).
 */
export async function switchClient(
	client: string,
	target: TmuxTarget,
	exec: ExecFn,
): Promise<{ ok: boolean; stderr?: string }> {
	const fullTarget = formatTarget(target);
	try {
		await exec("tmux", ["switch-client", "-c", client, "-t", fullTarget]);
		return { ok: true };
	} catch (error) {
		const stderr =
			error instanceof Error
				? ((error as Error & { stderr?: string }).stderr ?? error.message)
				: String(error);
		return { ok: false, stderr };
	}
}

/**
 * Detect which terminal application is running from the allowlist.
 * Checks running processes for known terminal apps.
 */
export async function detectTerminalApp(
	exec: ExecFn,
): Promise<TerminalApp | null> {
	try {
		const { stdout } = await exec("ps", ["-eo", "comm"]);

		const processes = stdout.toLowerCase();

		for (const app of TERMINAL_APP_ALLOWLIST) {
			if (processes.includes(app.toLowerCase())) {
				return app;
			}
		}
	} catch {
		// ps failed: can't detect
	}
	return null;
}

/**
 * Activate the terminal window via osascript.
 * Fix #1: Brings the terminal window to front after tmux switch.
 * Validates app name against allowlist to prevent injection.
 */
export async function activateTerminal(
	app: TerminalApp,
	exec: ExecFn,
): Promise<boolean> {
	// Double-check: only activate apps from our validated allowlist
	if (!TERMINAL_APP_ALLOWLIST.includes(app)) return false;

	try {
		await exec("osascript", ["-e", `tell application "${app}" to activate`]);
		return true;
	} catch {
		return false;
	}
}

/**
 * Full terminal open flow.
 * Orchestrates: parse → validate → list clients → switch → activate.
 */
export async function openTerminal(
	tmuxTargetStr: string,
	deps: TerminalOpenerDeps,
): Promise<OpenResult> {
	const { exec, notify } = deps;

	// Step 1: Parse target
	const target = parseTmuxTarget(tmuxTargetStr);
	if (!target) {
		notify("Pi Fleet", "Invalid tmux target format");
		return { ok: false, reason: "invalid-target" };
	}

	// Step 2: Validate pane exists (Fix #7)
	const paneExists = await validatePane(target, exec);
	if (!paneExists) {
		notify("Pi Fleet", `Pane no longer exists: ${tmuxTargetStr}`);
		return { ok: false, reason: "pane-not-found" };
	}

	// Step 3: List clients scoped to session (Fix #2)
	let clientResult: { count: number; first: string | null };
	try {
		clientResult = await listClients(target.session, exec);
	} catch {
		notify("Pi Fleet", "tmux server not running");
		return { ok: false, reason: "no-server" };
	}

	// Step 4: Classify client state
	if (clientResult.count === 0) {
		notify("Pi Fleet", `No terminal attached to session '${target.session}'`);
		return { ok: false, reason: "no-client" };
	}

	if (clientResult.count > 1) {
		notify(
			"Pi Fleet",
			`Multiple terminals on session '${target.session}'; detach extras`,
		);
		return { ok: false, reason: "multi-client" };
	}

	// Step 5: Switch client
	const switchResult = await switchClient(clientResult.first!, target, exec);
	if (!switchResult.ok) {
		notify("Pi Fleet", `tmux switch failed: ${switchResult.stderr}`);
		return { ok: false, reason: "switch-failed" };
	}

	// Step 6: Activate terminal window (Fix #1)
	const terminalApp = await detectTerminalApp(exec);
	if (terminalApp) {
		const activated = await activateTerminal(terminalApp, exec);
		if (!activated) {
			notify("Pi Fleet", "Could not bring terminal to foreground");
			// Non-fatal: tmux switch still succeeded
		}
	}

	return { ok: true };
}
