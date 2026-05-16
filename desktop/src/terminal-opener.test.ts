import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	parseTmuxTarget,
	formatTarget,
	validatePane,
	listClients,
	switchClient,
	detectTerminalApp,
	activateTerminal,
	openTerminal,
	TERMINAL_APP_ALLOWLIST,
} from "./terminal-opener.js";
import type {
	ExecFn,
	NotifyFn,
	TerminalOpenerDeps,
} from "./terminal-opener.js";

function buildExec(
	responses: Record<string, { stdout: string; stderr?: string }>,
): ExecFn {
	return async (cmd: string, args: string[]) => {
		const key = `${cmd} ${args.join(" ")}`;
		for (const [pattern, response] of Object.entries(responses)) {
			if (key.includes(pattern)) {
				return { stdout: response.stdout, stderr: response.stderr ?? "" };
			}
		}
		throw new Error(`Unexpected exec call: ${key}`);
	};
}

function buildFailingExec(failPatterns: string[]): ExecFn {
	return async (cmd: string, args: string[]) => {
		const key = `${cmd} ${args.join(" ")}`;
		for (const pattern of failPatterns) {
			if (key.includes(pattern)) {
				const error = new Error(`Command failed: ${key}`) as Error & {
					stderr: string;
				};
				error.stderr = `error: ${pattern} failed`;
				throw error;
			}
		}
		return { stdout: "", stderr: "" };
	};
}

function buildDeps(overrides?: {
	execResponses?: Record<string, { stdout: string; stderr?: string }>;
	failPatterns?: string[];
}): TerminalOpenerDeps & {
	notifications: Array<{ title: string; body: string }>;
} {
	const notifications: Array<{ title: string; body: string }> = [];
	const notify: NotifyFn = (title, body) => {
		notifications.push({ title, body });
	};

	let exec: ExecFn;
	if (overrides?.execResponses) {
		exec = buildExec(overrides.execResponses);
	} else if (overrides?.failPatterns) {
		exec = buildFailingExec(overrides.failPatterns);
	} else {
		exec = async () => ({ stdout: "", stderr: "" });
	}

	return { exec, notify, notifications };
}

describe("parseTmuxTarget", () => {
	it("parses standard numeric target", () => {
		const result = parseTmuxTarget("main:1.0");
		expect(result).toEqual({ session: "main", window: "1", pane: "0" });
	});

	it("handles non-numeric session names", () => {
		const result = parseTmuxTarget("my-project:dev.2");
		expect(result).toEqual({ session: "my-project", window: "dev", pane: "2" });
	});

	it("handles numeric session names", () => {
		const result = parseTmuxTarget("0:0.0");
		expect(result).toEqual({ session: "0", window: "0", pane: "0" });
	});

	it("handles complex session names with dots", () => {
		const result = parseTmuxTarget("my.project:1.0");
		expect(result).toEqual({ session: "my.project", window: "1", pane: "0" });
	});

	it("handles session with hyphens and underscores", () => {
		const result = parseTmuxTarget("work_env-2:3.1");
		expect(result).toEqual({ session: "work_env-2", window: "3", pane: "1" });
	});

	it("returns null for invalid format (no colon)", () => {
		expect(parseTmuxTarget("invalid")).toBeNull();
	});

	it("returns null for invalid format (no dot)", () => {
		expect(parseTmuxTarget("main:1")).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(parseTmuxTarget("")).toBeNull();
	});

	it("returns null when pane is not numeric", () => {
		expect(parseTmuxTarget("main:1.abc")).toBeNull();
	});
});

describe("formatTarget", () => {
	it("formats target back to string", () => {
		expect(formatTarget({ session: "main", window: "1", pane: "0" })).toBe(
			"main:1.0",
		);
	});

	it("formats non-numeric window", () => {
		expect(formatTarget({ session: "work", window: "dev", pane: "2" })).toBe(
			"work:dev.2",
		);
	});
});

describe("validatePane", () => {
	it("returns true when tmux display-message succeeds", async () => {
		const exec = buildExec({ "display-message": { stdout: "" } });
		const result = await validatePane(
			{ session: "main", window: "1", pane: "0" },
			exec,
		);
		expect(result).toBe(true);
	});

	it("returns false when tmux display-message fails", async () => {
		const exec = buildFailingExec(["display-message"]);
		const result = await validatePane(
			{ session: "main", window: "1", pane: "0" },
			exec,
		);
		expect(result).toBe(false);
	});

	it("passes the full target string to tmux", async () => {
		const calls: string[][] = [];
		const exec: ExecFn = async (cmd, args) => {
			calls.push([cmd, ...args]);
			return { stdout: "", stderr: "" };
		};

		await validatePane({ session: "work", window: "dev", pane: "2" }, exec);

		expect(calls[0]).toEqual([
			"tmux",
			"display-message",
			"-t",
			"work:dev.2",
			"-p",
			"",
		]);
	});
});

describe("listClients", () => {
	it("returns client count and first client name", async () => {
		const exec = buildExec({
			"list-clients": { stdout: "/dev/ttys001\n" },
		});

		const result = await listClients("main", exec);
		expect(result).toEqual({ count: 1, first: "/dev/ttys001" });
	});

	it("returns zero clients for empty output", async () => {
		const exec = buildExec({ "list-clients": { stdout: "" } });
		const result = await listClients("main", exec);
		expect(result).toEqual({ count: 0, first: null });
	});

	it("returns multiple clients", async () => {
		const exec = buildExec({
			"list-clients": { stdout: "/dev/ttys001\n/dev/ttys002\n" },
		});

		const result = await listClients("main", exec);
		expect(result).toEqual({ count: 2, first: "/dev/ttys001" });
	});

	it("scopes to session with -t flag (Fix #2)", async () => {
		const calls: string[][] = [];
		const exec: ExecFn = async (cmd, args) => {
			calls.push([cmd, ...args]);
			return { stdout: "/dev/ttys001\n", stderr: "" };
		};

		await listClients("my-session", exec);

		expect(calls[0]).toEqual([
			"tmux",
			"list-clients",
			"-t",
			"my-session",
			"-F",
			"#{client_name}",
		]);
	});
});

describe("switchClient", () => {
	it("returns ok:true on success", async () => {
		const exec = buildExec({ "switch-client": { stdout: "" } });
		const result = await switchClient(
			"/dev/ttys001",
			{ session: "main", window: "1", pane: "0" },
			exec,
		);
		expect(result).toEqual({ ok: true });
	});

	it("returns ok:false with stderr on failure", async () => {
		const exec = buildFailingExec(["switch-client"]);
		const result = await switchClient(
			"/dev/ttys001",
			{ session: "main", window: "1", pane: "0" },
			exec,
		);
		expect(result.ok).toBe(false);
		expect(result.stderr).toBeDefined();
	});

	it("passes args as array (Fix #6 prevention)", async () => {
		const calls: string[][] = [];
		const exec: ExecFn = async (cmd, args) => {
			calls.push([cmd, ...args]);
			return { stdout: "", stderr: "" };
		};

		await switchClient(
			"/dev/ttys001",
			{ session: "main", window: "2", pane: "1" },
			exec,
		);

		expect(calls[0]).toEqual([
			"tmux",
			"switch-client",
			"-c",
			"/dev/ttys001",
			"-t",
			"main:2.1",
		]);
	});
});

describe("detectTerminalApp", () => {
	it("detects iTerm2 from process list", async () => {
		const exec = buildExec({
			ps: { stdout: "/usr/bin/zsh\niTerm2\n/usr/bin/vim\n" },
		});

		const result = await detectTerminalApp(exec);
		expect(result).toBe("iTerm2");
	});

	it("detects Terminal.app (case-insensitive match)", async () => {
		const exec = buildExec({
			ps: { stdout: "/usr/bin/zsh\nterminal\n" },
		});

		const result = await detectTerminalApp(exec);
		expect(result).toBe("Terminal");
	});

	it("detects kitty", async () => {
		const exec = buildExec({
			ps: { stdout: "/usr/local/bin/kitty\n" },
		});

		const result = await detectTerminalApp(exec);
		expect(result).toBe("kitty");
	});

	it("returns null when no terminal app found", async () => {
		const exec = buildExec({
			ps: { stdout: "/usr/bin/zsh\nvim\n" },
		});

		const result = await detectTerminalApp(exec);
		expect(result).toBeNull();
	});

	it("returns null when ps fails", async () => {
		const exec = buildFailingExec(["ps"]);
		const result = await detectTerminalApp(exec);
		expect(result).toBeNull();
	});

	it("respects allowlist priority order", async () => {
		const exec = buildExec({
			ps: { stdout: "iTerm2\nTerminal\nkitty\n" },
		});

		const result = await detectTerminalApp(exec);
		expect(result).toBe("iTerm2");
	});
});

describe("activateTerminal", () => {
	it("runs osascript with correct app name", async () => {
		const calls: string[][] = [];
		const exec: ExecFn = async (cmd, args) => {
			calls.push([cmd, ...args]);
			return { stdout: "", stderr: "" };
		};

		const result = await activateTerminal("iTerm2", exec);

		expect(result).toBe(true);
		expect(calls[0]).toEqual([
			"osascript",
			"-e",
			'tell application "iTerm2" to activate',
		]);
	});

	it("returns false when osascript fails", async () => {
		const exec = buildFailingExec(["osascript"]);
		const result = await activateTerminal("iTerm2", exec);
		expect(result).toBe(false);
	});

	it("validates app against allowlist (prevents injection)", () => {
		// Verify the allowlist contains expected entries
		expect(TERMINAL_APP_ALLOWLIST).toContain("iTerm2");
		expect(TERMINAL_APP_ALLOWLIST).toContain("Terminal");
		expect(TERMINAL_APP_ALLOWLIST).toContain("Alacritty");
		expect(TERMINAL_APP_ALLOWLIST).toContain("kitty");
		expect(TERMINAL_APP_ALLOWLIST).toContain("WezTerm");
	});

	it("rejects app names not in allowlist", async () => {
		const exec: ExecFn = async () => ({ stdout: "", stderr: "" });
		// @ts-expect-error: testing runtime guard with invalid value
		const result = await activateTerminal('malicious" to do evil', exec);
		expect(result).toBe(false);
	});
});

describe("openTerminal (full flow)", () => {
	it("succeeds with valid target, single client, and terminal detected", async () => {
		const calls: string[][] = [];
		const exec: ExecFn = async (cmd, args) => {
			calls.push([cmd, ...args]);
			const key = `${cmd} ${args.join(" ")}`;
			if (key.includes("display-message")) {
				return { stdout: "", stderr: "" };
			}
			if (key.includes("list-clients")) {
				return { stdout: "/dev/ttys001\n", stderr: "" };
			}
			if (key.includes("switch-client")) {
				return { stdout: "", stderr: "" };
			}
			if (key.includes("ps")) {
				return { stdout: "iTerm2\n", stderr: "" };
			}
			if (key.includes("osascript")) {
				return { stdout: "", stderr: "" };
			}
			return { stdout: "", stderr: "" };
		};

		const notifications: Array<{ title: string; body: string }> = [];
		const notify: NotifyFn = (title, body) =>
			notifications.push({ title, body });

		const result = await openTerminal("main:1.0", { exec, notify });

		expect(result).toEqual({ ok: true });
		expect(notifications).toHaveLength(0);
	});

	it("returns invalid-target for unparseable target", async () => {
		const deps = buildDeps();
		const result = await openTerminal("invalid", deps);

		expect(result).toEqual({ ok: false, reason: "invalid-target" });
		expect(deps.notifications[0].body).toContain("Invalid tmux target");
	});

	it("returns pane-not-found when validation fails", async () => {
		const exec: ExecFn = async (cmd, args) => {
			if (args.includes("display-message")) {
				throw new Error("pane not found");
			}
			return { stdout: "", stderr: "" };
		};

		const notifications: Array<{ title: string; body: string }> = [];
		const notify: NotifyFn = (title, body) =>
			notifications.push({ title, body });

		const result = await openTerminal("main:1.0", { exec, notify });

		expect(result).toEqual({ ok: false, reason: "pane-not-found" });
		expect(notifications[0].body).toContain("Pane no longer exists");
	});

	it("returns no-server when list-clients throws", async () => {
		const exec: ExecFn = async (cmd, args) => {
			if (args.includes("display-message")) {
				return { stdout: "", stderr: "" };
			}
			if (args.includes("list-clients")) {
				throw new Error("no server");
			}
			return { stdout: "", stderr: "" };
		};

		const notifications: Array<{ title: string; body: string }> = [];
		const notify: NotifyFn = (title, body) =>
			notifications.push({ title, body });

		const result = await openTerminal("main:1.0", { exec, notify });

		expect(result).toEqual({ ok: false, reason: "no-server" });
		expect(notifications[0].body).toContain("tmux server not running");
	});

	it("returns no-client when zero clients attached", async () => {
		const exec: ExecFn = async (cmd, args) => {
			if (args.includes("display-message")) {
				return { stdout: "", stderr: "" };
			}
			if (args.includes("list-clients")) {
				return { stdout: "", stderr: "" };
			}
			return { stdout: "", stderr: "" };
		};

		const notifications: Array<{ title: string; body: string }> = [];
		const notify: NotifyFn = (title, body) =>
			notifications.push({ title, body });

		const result = await openTerminal("main:1.0", { exec, notify });

		expect(result).toEqual({ ok: false, reason: "no-client" });
		expect(notifications[0].body).toContain("No terminal attached");
	});

	it("returns multi-client when multiple clients attached", async () => {
		const exec: ExecFn = async (cmd, args) => {
			if (args.includes("display-message")) {
				return { stdout: "", stderr: "" };
			}
			if (args.includes("list-clients")) {
				return { stdout: "/dev/ttys001\n/dev/ttys002\n", stderr: "" };
			}
			return { stdout: "", stderr: "" };
		};

		const notifications: Array<{ title: string; body: string }> = [];
		const notify: NotifyFn = (title, body) =>
			notifications.push({ title, body });

		const result = await openTerminal("main:1.0", { exec, notify });

		expect(result).toEqual({ ok: false, reason: "multi-client" });
		expect(notifications[0].body).toContain("Multiple terminals");
	});

	it("returns switch-failed when switch-client errors", async () => {
		const exec: ExecFn = async (cmd, args) => {
			if (args.includes("display-message")) {
				return { stdout: "", stderr: "" };
			}
			if (args.includes("list-clients")) {
				return { stdout: "/dev/ttys001\n", stderr: "" };
			}
			if (args.includes("switch-client")) {
				const error = new Error("switch failed") as Error & { stderr: string };
				error.stderr = "can't find client";
				throw error;
			}
			return { stdout: "", stderr: "" };
		};

		const notifications: Array<{ title: string; body: string }> = [];
		const notify: NotifyFn = (title, body) =>
			notifications.push({ title, body });

		const result = await openTerminal("main:1.0", { exec, notify });

		expect(result).toEqual({ ok: false, reason: "switch-failed" });
		expect(notifications[0].body).toContain("tmux switch failed");
	});

	it("succeeds even when terminal activation fails (non-fatal)", async () => {
		const exec: ExecFn = async (cmd, args) => {
			if (args.includes("display-message")) {
				return { stdout: "", stderr: "" };
			}
			if (args.includes("list-clients")) {
				return { stdout: "/dev/ttys001\n", stderr: "" };
			}
			if (args.includes("switch-client")) {
				return { stdout: "", stderr: "" };
			}
			if (cmd === "ps") {
				return { stdout: "iTerm2\n", stderr: "" };
			}
			if (cmd === "osascript") {
				throw new Error("activation failed");
			}
			return { stdout: "", stderr: "" };
		};

		const notifications: Array<{ title: string; body: string }> = [];
		const notify: NotifyFn = (title, body) =>
			notifications.push({ title, body });

		const result = await openTerminal("main:1.0", { exec, notify });

		// Still succeeds: tmux switch worked, activation is non-fatal
		expect(result).toEqual({ ok: true });
		expect(notifications[0].body).toContain("Could not bring terminal");
	});

	it("succeeds silently when no terminal app detected", async () => {
		const exec: ExecFn = async (cmd, args) => {
			if (args.includes("display-message")) {
				return { stdout: "", stderr: "" };
			}
			if (args.includes("list-clients")) {
				return { stdout: "/dev/ttys001\n", stderr: "" };
			}
			if (args.includes("switch-client")) {
				return { stdout: "", stderr: "" };
			}
			if (cmd === "ps") {
				return { stdout: "/usr/bin/zsh\n", stderr: "" };
			}
			return { stdout: "", stderr: "" };
		};

		const notifications: Array<{ title: string; body: string }> = [];
		const notify: NotifyFn = (title, body) =>
			notifications.push({ title, body });

		const result = await openTerminal("main:1.0", { exec, notify });

		expect(result).toEqual({ ok: true });
		expect(notifications).toHaveLength(0);
	});
});
