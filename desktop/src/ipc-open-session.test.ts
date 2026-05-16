import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "../../server/src/server.js";
import type { PiFleetServer } from "../../server/src/server.js";
import { openTerminal } from "./terminal-opener.js";
import type {
	ExecFn,
	NotifyFn,
	TerminalOpenerDeps,
} from "./terminal-opener.js";
import { SERVER_PORT } from "@pi-fleet/shared";

/**
 * Integration test: exercises the full IPC flow (without Electron).
 * Tests: server route resolution → terminal opener execution.
 */
describe("IPC open-session flow (integration)", () => {
	let server: PiFleetServer;
	const testPort = 18314; // Use a different port for tests

	beforeEach(async () => {
		server = createServer({ port: testPort });
		await server.start();
	});

	afterEach(async () => {
		await server.stop();
	});

	it("resolves tmuxTarget from server and calls openTerminal", async () => {
		// Register a session with a tmux target
		server.registry.register({
			sessionId: "test-sess",
			pid: 1000,
			cwd: "/tmp/project",
			tmuxTarget: "main:1.0",
			startTime: new Date().toISOString(),
		});

		// Simulate the IPC handler's server call
		const response = await fetch(
			`http://127.0.0.1:${testPort}/api/open-terminal`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId: "test-sess" }),
			},
		);

		expect(response.status).toBe(200);
		const data = (await response.json()) as { tmuxTarget: string };
		expect(data.tmuxTarget).toBe("main:1.0");

		// Now simulate the terminal opener with the resolved target
		const notifications: Array<{ title: string; body: string }> = [];
		const exec: ExecFn = async (cmd, args) => {
			if (args.includes("display-message")) return { stdout: "", stderr: "" };
			if (args.includes("list-clients"))
				return { stdout: "/dev/ttys001\n", stderr: "" };
			if (args.includes("switch-client")) return { stdout: "", stderr: "" };
			if (cmd === "ps") return { stdout: "iTerm2\n", stderr: "" };
			if (cmd === "osascript") return { stdout: "", stderr: "" };
			return { stdout: "", stderr: "" };
		};
		const notify: NotifyFn = (title, body) =>
			notifications.push({ title, body });

		const result = await openTerminal(data.tmuxTarget, { exec, notify });
		expect(result).toEqual({ ok: true });
	});

	it("returns not-in-tmux when session has no tmux target", async () => {
		server.registry.register({
			sessionId: "no-tmux-sess",
			pid: 2000,
			cwd: "/tmp/other",
			tmuxTarget: null,
			startTime: new Date().toISOString(),
		});

		const response = await fetch(
			`http://127.0.0.1:${testPort}/api/open-terminal`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId: "no-tmux-sess" }),
			},
		);

		expect(response.status).toBe(400);
	});

	it("returns 404 when session not found", async () => {
		const response = await fetch(
			`http://127.0.0.1:${testPort}/api/open-terminal`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId: "nonexistent" }),
			},
		);

		expect(response.status).toBe(404);
	});
});
