import { describe, it, expect } from "vitest";
import {
	resolveSession,
	listClients,
	switchClient,
	detectTerminalApp,
	activateTerminal,
	openTerminal,
	isValidPaneId,
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

describe("resolveSession", () => {
	it("returns session name when pane exists", async () => {
		const exec = buildExec({ "display-message": { stdout: "main\n" } });
		const result = await resolveSession("%5", exec);
		expect(result).toBe("main");
	});

	it("returns null when pane does not exist", async () => {
		const exec = buildFailingExec(["display-message"]);
		const result = await resolveSession("%5", exec);
		expect(result).toBeNull();
	});

	it("returns null when stdout is empty", async () => {
		const exec = buildExec({ "display-message": { stdout: "" } });
		const result = await resolveSession("%5", exec);
		expect(result).toBeNull();
	});

	it("passes pane ID directly to tmux -t flag", async () => {
		const calls: string[][] = [];
		const exec: ExecFn = async (cmd, args) => {
			calls.push([cmd, ...args]);
			return { stdout: "dev\n", stderr: "" };
		};

		await resolveSession("%12", exec);

		expect(calls[0]).toEqual([
			"tmux",
			"display-message",
			"-t",
			"%12",
			"-p",
			"#S",
		]);
	});

	it("trims whitespace from session name", async () => {
		const exec = buildExec({
			"display-message": { stdout: "  my-session  \n" },
		});
		const result = await resolveSession("%0", exec);
		expect(result).toBe("my-session");
	});
});

describe("listClients", () => {
	it("returns client count and first client name", async () => {
		const exec = buildExec({
			"list-clients": { stdout: "/dev/ttys001\n" },
		});

		const result = await listClients(exec);
		expect(result).toEqual({ count: 1, first: "/dev/ttys001" });
	});

	it("returns zero clients for empty output", async () => {
		const exec = buildExec({ "list-clients": { stdout: "" } });
		const result = await listClients(exec);
		expect(result).toEqual({ count: 0, first: null });
	});

	it("returns multiple clients", async () => {
		const exec = buildExec({
			"list-clients": { stdout: "/dev/ttys001\n/dev/ttys002\n" },
		});

		const result = await listClients(exec);
		expect(result).toEqual({ count: 2, first: "/dev/ttys001" });
	});

	it("lists all clients without session scoping", async () => {
		const calls: string[][] = [];
		const exec: ExecFn = async (cmd, args) => {
			calls.push([cmd, ...args]);
			return { stdout: "/dev/ttys001\n", stderr: "" };
		};

		await listClients(exec);

		expect(calls[0]).toEqual(["tmux", "list-clients", "-F", "#{client_name}"]);
	});
});

describe("switchClient", () => {
	it("returns ok:true on success", async () => {
		const exec = buildExec({ "switch-client": { stdout: "" } });
		const result = await switchClient("/dev/ttys001", "%5", exec);
		expect(result).toEqual({ ok: true });
	});

	it("returns ok:false with stderr on failure", async () => {
		const exec = buildFailingExec(["switch-client"]);
		const result = await switchClient("/dev/ttys001", "%5", exec);
		expect(result.ok).toBe(false);
		expect(result.stderr).toBeDefined();
	});

	it("passes pane ID directly to -t flag", async () => {
		const calls: string[][] = [];
		const exec: ExecFn = async (cmd, args) => {
			calls.push([cmd, ...args]);
			return { stdout: "", stderr: "" };
		};

		await switchClient("/dev/ttys001", "%7", exec);

		expect(calls[0]).toEqual([
			"tmux",
			"switch-client",
			"-c",
			"/dev/ttys001",
			"-t",
			"%7",
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

describe("isValidPaneId", () => {
	it("accepts %0", () => {
		expect(isValidPaneId("%0")).toBe(true);
	});

	it("accepts %5", () => {
		expect(isValidPaneId("%5")).toBe(true);
	});

	it("accepts %123", () => {
		expect(isValidPaneId("%123")).toBe(true);
	});

	it("rejects old session:window.pane format", () => {
		expect(isValidPaneId("main:1.0")).toBe(false);
	});

	it("rejects empty string", () => {
		expect(isValidPaneId("")).toBe(false);
	});

	it("rejects bare number", () => {
		expect(isValidPaneId("5")).toBe(false);
	});

	it("rejects % without digits", () => {
		expect(isValidPaneId("%")).toBe(false);
	});

	it("rejects % with non-digit characters", () => {
		expect(isValidPaneId("%abc")).toBe(false);
	});

	it("rejects target with trailing whitespace", () => {
		expect(isValidPaneId("%5 ")).toBe(false);
	});
});

describe("openTerminal (full flow)", () => {
	it("succeeds with valid pane, single client, and terminal detected", async () => {
		const calls: string[][] = [];
		const exec: ExecFn = async (cmd, args) => {
			calls.push([cmd, ...args]);
			const key = `${cmd} ${args.join(" ")}`;
			if (key.includes("display-message")) {
				return { stdout: "main\n", stderr: "" };
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

		const result = await openTerminal("%5", { exec, notify });

		expect(result).toEqual({ ok: true });
		expect(notifications).toHaveLength(0);

		// Verify switch-client uses pane ID directly
		const switchCall = calls.find((call) => call.includes("switch-client"));
		expect(switchCall).toContain("%5");
	});

	it("returns invalid-target when pane ID format is malformed", async () => {
		const exec: ExecFn = async () => ({ stdout: "", stderr: "" });
		const notifications: Array<{ title: string; body: string }> = [];
		const notify: NotifyFn = (title, body) =>
			notifications.push({ title, body });

		const result = await openTerminal("main:1.0", { exec, notify });

		expect(result).toEqual({ ok: false, reason: "invalid-target" });
		expect(notifications[0]).toEqual({
			title: "Pi Fleet",
			body: "Invalid tmux target formatting",
		});
	});

	it("returns invalid-target for bare number without % prefix", async () => {
		const exec: ExecFn = async () => ({ stdout: "", stderr: "" });
		const notifications: Array<{ title: string; body: string }> = [];
		const notify: NotifyFn = (title, body) =>
			notifications.push({ title, body });

		const result = await openTerminal("5", { exec, notify });

		expect(result).toEqual({ ok: false, reason: "invalid-target" });
		expect(notifications[0].body).toBe("Invalid tmux target formatting");
	});

	it("returns pane-not-found when session resolution fails", async () => {
		const exec: ExecFn = async (cmd, args) => {
			if (args.includes("display-message")) {
				throw new Error("pane not found");
			}
			return { stdout: "", stderr: "" };
		};

		const notifications: Array<{ title: string; body: string }> = [];
		const notify: NotifyFn = (title, body) =>
			notifications.push({ title, body });

		const result = await openTerminal("%5", { exec, notify });

		expect(result).toEqual({ ok: false, reason: "pane-not-found" });
		expect(notifications[0].body).toContain("Pane no longer exists");
	});

	it("returns no-server when list-clients throws", async () => {
		const exec: ExecFn = async (cmd, args) => {
			if (args.includes("display-message")) {
				return { stdout: "main\n", stderr: "" };
			}
			if (args.includes("list-clients")) {
				throw new Error("no server");
			}
			return { stdout: "", stderr: "" };
		};

		const notifications: Array<{ title: string; body: string }> = [];
		const notify: NotifyFn = (title, body) =>
			notifications.push({ title, body });

		const result = await openTerminal("%5", { exec, notify });

		expect(result).toEqual({ ok: false, reason: "no-server" });
		expect(notifications[0].body).toContain("tmux server not running");
	});

	it("returns no-client when zero clients attached", async () => {
		const exec: ExecFn = async (cmd, args) => {
			if (args.includes("display-message")) {
				return { stdout: "main\n", stderr: "" };
			}
			if (args.includes("list-clients")) {
				return { stdout: "", stderr: "" };
			}
			return { stdout: "", stderr: "" };
		};

		const notifications: Array<{ title: string; body: string }> = [];
		const notify: NotifyFn = (title, body) =>
			notifications.push({ title, body });

		const result = await openTerminal("%5", { exec, notify });

		expect(result).toEqual({ ok: false, reason: "no-client" });
		expect(notifications[0].body).toContain("No terminal attached");
	});

	it("returns multi-client when multiple clients attached", async () => {
		const exec: ExecFn = async (cmd, args) => {
			if (args.includes("display-message")) {
				return { stdout: "main\n", stderr: "" };
			}
			if (args.includes("list-clients")) {
				return { stdout: "/dev/ttys001\n/dev/ttys002\n", stderr: "" };
			}
			return { stdout: "", stderr: "" };
		};

		const notifications: Array<{ title: string; body: string }> = [];
		const notify: NotifyFn = (title, body) =>
			notifications.push({ title, body });

		const result = await openTerminal("%5", { exec, notify });

		expect(result).toEqual({ ok: false, reason: "multi-client" });
		expect(notifications[0].body).toContain("Multiple terminals");
	});

	it("returns switch-failed when switch-client errors", async () => {
		const exec: ExecFn = async (cmd, args) => {
			if (args.includes("display-message")) {
				return { stdout: "main\n", stderr: "" };
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

		const result = await openTerminal("%5", { exec, notify });

		expect(result).toEqual({ ok: false, reason: "switch-failed" });
		expect(notifications[0].body).toContain("tmux switch failed");
	});

	it("succeeds even when terminal activation fails (non-fatal)", async () => {
		const exec: ExecFn = async (cmd, args) => {
			if (args.includes("display-message")) {
				return { stdout: "main\n", stderr: "" };
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

		const result = await openTerminal("%5", { exec, notify });

		expect(result).toEqual({ ok: true });
		expect(notifications[0].body).toContain("Could not bring terminal");
	});

	it("succeeds silently when no terminal app detected", async () => {
		const exec: ExecFn = async (cmd, args) => {
			if (args.includes("display-message")) {
				return { stdout: "main\n", stderr: "" };
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

		const result = await openTerminal("%5", { exec, notify });

		expect(result).toEqual({ ok: true });
		expect(notifications).toHaveLength(0);
	});
});
