import { describe, it, expect } from "vitest";
import { captureTmuxTarget, type Exec } from "./tmux-target.js";

describe("captureTmuxTarget", () => {
	const fakeExec =
		(stdout: string, code = 0): Exec =>
		async () => ({ stdout, code });

	it("returns parsed target on happy path", async () => {
		const result = await captureTmuxTarget(
			{ TMUX: "/tmp/tmux-501/default,123,0" },
			fakeExec("main:1.2\n"),
		);
		expect(result).toEqual({
			session: "main",
			window: "1",
			pane: "2",
			target: "main:1.2",
		});
	});

	it("handles multi-word session names", async () => {
		const result = await captureTmuxTarget(
			{ TMUX: "/tmp/tmux-501/default,123,0" },
			fakeExec("my-project:3.1\n"),
		);
		expect(result).toEqual({
			session: "my-project",
			window: "3",
			pane: "1",
			target: "my-project:3.1",
		});
	});

	it("returns null when TMUX is unset", async () => {
		const result = await captureTmuxTarget({}, fakeExec("main:1.2"));
		expect(result).toBeNull();
	});

	it("returns null when TMUX is empty", async () => {
		const result = await captureTmuxTarget({ TMUX: "" }, fakeExec("main:1.2"));
		expect(result).toBeNull();
	});

	it("returns null when exec throws", async () => {
		const throwing: Exec = async () => {
			throw new Error("spawn failed");
		};
		const result = await captureTmuxTarget(
			{ TMUX: "/tmp/tmux-501/default" },
			throwing,
		);
		expect(result).toBeNull();
	});

	it("returns null when exec returns non-zero", async () => {
		const result = await captureTmuxTarget(
			{ TMUX: "/tmp/tmux-501/default" },
			fakeExec("", 1),
		);
		expect(result).toBeNull();
	});

	it("returns null when stdout is malformed", async () => {
		const result = await captureTmuxTarget(
			{ TMUX: "/tmp/tmux-501/default" },
			fakeExec("garbage-no-colon-or-dot"),
		);
		expect(result).toBeNull();
	});

	it("returns null when stdout is empty", async () => {
		const result = await captureTmuxTarget(
			{ TMUX: "/tmp/tmux-501/default" },
			fakeExec(""),
		);
		expect(result).toBeNull();
	});
});
