import type { OpenResult } from "@pi-fleet/shared";

/**
 * Validates that a tmux target matches the stable pane ID format: %N
 * (e.g., "%0", "%5", "%123").
 */
const PANE_ID_RE = /^%\d+$/;

export function isValidPaneId(target: string): boolean {
	return PANE_ID_RE.test(target);
}

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
 * Resolve the session name from a stable tmux pane ID (e.g., "%5").
 * Also validates that the pane still exists: if the pane is gone,
 * tmux will return an error.
 *
 * Returns the session name or null if the pane no longer exists.
 */
export async function resolveSession(
	paneId: string,
	exec: ExecFn,
): Promise<string | null> {
	try {
		const { stdout } = await exec("tmux", [
			"display-message",
			"-t",
			paneId,
			"-p",
			"#S",
		]);
		const session = stdout.trim();
		return session || null;
	} catch {
		return null;
	}
}

/**
 * List all tmux clients.
 * Not scoped to a session because switch-client can cross sessions:
 * the user's terminal may be attached to session A while the target
 * pane lives in session B.
 */
export async function listClients(
	exec: ExecFn,
): Promise<{ count: number; first: string | null }> {
	const { stdout } = await exec("tmux", [
		"list-clients",
		"-F",
		"#{client_name}",
	]);

	const clients = stdout.split(/\r?\n/).filter((line) => line.trim() !== "");

	return { count: clients.length, first: clients[0] ?? null };
}

/**
 * Switch the tmux client to the target pane using its stable pane ID.
 * All args are passed as array elements to execFile.
 */
export async function switchClient(
	client: string,
	paneId: string,
	exec: ExecFn,
): Promise<{ ok: boolean; stderr?: string }> {
	try {
		await exec("tmux", ["switch-client", "-c", client, "-t", paneId]);
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
 * Validates app name against allowlist to prevent injection.
 */
export async function activateTerminal(
	app: TerminalApp,
	exec: ExecFn,
): Promise<boolean> {
	if (!TERMINAL_APP_ALLOWLIST.includes(app)) {
		return false;
	}

	try {
		await exec("osascript", ["-e", `tell application "${app}" to activate`]);
		return true;
	} catch {
		return false;
	}
}

/**
 * Full terminal open flow using stable pane ID.
 * Orchestrates: resolve session → list clients → switch → activate.
 */
export async function openTerminal(
	paneId: string,
	deps: TerminalOpenerDeps,
): Promise<OpenResult> {
	const { exec, notify } = deps;

	// Step 0: Validate pane ID format
	if (!isValidPaneId(paneId)) {
		notify("Pi Fleet", "Invalid tmux target formatting");
		return { ok: false, reason: "invalid-target" };
	}

	// Step 1: Resolve session from pane ID (also validates pane exists)
	const session = await resolveSession(paneId, exec);
	if (!session) {
		notify("Pi Fleet", `Pane no longer exists: ${paneId}`);
		return { ok: false, reason: "pane-not-found" };
	}

	// Step 2: List all tmux clients (not scoped to session, since
	// switch-client can cross sessions)
	let clientResult: { count: number; first: string | null };
	try {
		clientResult = await listClients(exec);
	} catch {
		notify("Pi Fleet", "tmux server not running");
		return { ok: false, reason: "no-server" };
	}

	// Step 3: Classify client state
	if (clientResult.count === 0) {
		notify("Pi Fleet", "No terminal attached to tmux");
		return { ok: false, reason: "no-client" };
	}

	if (clientResult.count > 1) {
		notify("Pi Fleet", "Multiple terminals attached to tmux; detach extras");
		return { ok: false, reason: "multi-client" };
	}

	// Step 4: Switch client using pane ID directly
	const switchResult = await switchClient(clientResult.first!, paneId, exec);
	if (!switchResult.ok) {
		notify("Pi Fleet", `tmux switch failed: ${switchResult.stderr}`);
		return { ok: false, reason: "switch-failed" };
	}

	// Step 5: Activate terminal window
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
