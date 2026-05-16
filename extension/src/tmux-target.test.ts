import { describe, it, expect } from "vitest";
import { getTmuxPaneId } from "./tmux-target.js";

describe("getTmuxPaneId", () => {
	it("returns pane ID when TMUX_PANE is set", () => {
		expect(getTmuxPaneId({ TMUX_PANE: "%5" })).toBe("%5");
	});

	it("returns pane ID with high number", () => {
		expect(getTmuxPaneId({ TMUX_PANE: "%123" })).toBe("%123");
	});

	it("returns null when TMUX_PANE is unset", () => {
		expect(getTmuxPaneId({})).toBeNull();
	});

	it("returns null when TMUX_PANE is empty string", () => {
		expect(getTmuxPaneId({ TMUX_PANE: "" })).toBeNull();
	});

	it("returns value regardless of other TMUX env vars", () => {
		expect(
			getTmuxPaneId({
				TMUX: "/tmp/tmux-501/default,123,0",
				TMUX_PANE: "%7",
			}),
		).toBe("%7");
	});

	it("returns null when only TMUX is set but TMUX_PANE is not", () => {
		expect(getTmuxPaneId({ TMUX: "/tmp/tmux-501/default,123,0" })).toBeNull();
	});
});
