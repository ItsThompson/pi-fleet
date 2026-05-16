import { ipcMain } from "electron";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { OpenResult } from "@pi-fleet/shared";
import { SERVER_PORT } from "@pi-fleet/shared";
import { openTerminal } from "./terminal-opener.js";
import type { ExecFn, NotifyFn } from "./terminal-opener.js";

const execFileAsync = promisify(execFileCb);

const exec: ExecFn = async (cmd, args) => {
	const { stdout, stderr } = await execFileAsync(cmd, args);
	return { stdout, stderr };
};

const notify: NotifyFn = (title, body) => {
	// Dynamic import to avoid issues in test environments
	const { Notification } = require("electron");
	new Notification({ title, body }).show();
};

/**
 * Register the pf:open-session IPC handler.
 * Flow: renderer sends { sessionId } → main calls server /api/open-terminal
 * → gets tmuxTarget → runs terminal opener → returns OpenResult.
 */
export function registerOpenSessionIPC(): void {
	ipcMain.handle(
		"pf:open-session",
		async (_event, payload: { sessionId: string }): Promise<OpenResult> => {
			const { sessionId } = payload;

			// Step 1: Resolve tmuxTarget from server
			const serverUrl = `http://127.0.0.1:${SERVER_PORT}`;
			let tmuxTarget: string;

			try {
				const response = await fetch(`${serverUrl}/api/open-terminal`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ sessionId }),
				});

				if (response.status === 404) {
					return { ok: false, reason: "invalid-target" };
				}

				if (response.status === 400) {
					return { ok: false, reason: "not-in-tmux" };
				}

				if (!response.ok) {
					return { ok: false, reason: "invalid-target" };
				}

				const data = (await response.json()) as { tmuxTarget: string };
				tmuxTarget = data.tmuxTarget;
			} catch {
				return { ok: false, reason: "no-server" };
			}

			// Step 2: Execute the terminal opener flow
			return openTerminal(tmuxTarget, { exec, notify });
		},
	);
}
