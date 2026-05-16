import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	getBridge,
	getServerUrl,
	openInTerminal,
	selectDirectory,
} from "./bridge";

describe("bridge", () => {
	const originalPiFleet = window.piFleet;

	afterEach(() => {
		if (originalPiFleet === undefined) {
			delete window.piFleet;
		} else {
			window.piFleet = originalPiFleet;
		}
	});

	describe("getBridge", () => {
		it("returns the bridge when available", () => {
			const mockBridge = {
				openSession: vi.fn(),
				selectDirectory: vi.fn(),
				getConfig: vi.fn(),
				setConfig: vi.fn(),
				onVisibilityChange: vi.fn(),
				getServerUrl: vi.fn(() => "http://127.0.0.1:8314"),
				getVersion: vi.fn(() => "1.0.0"),
			};
			window.piFleet = mockBridge;

			expect(getBridge()).toBe(mockBridge);
		});

		it("returns null when bridge is unavailable", () => {
			delete window.piFleet;

			expect(getBridge()).toBeNull();
		});
	});

	describe("getServerUrl", () => {
		it("returns the bridge URL when available", () => {
			window.piFleet = {
				openSession: vi.fn(),
				selectDirectory: vi.fn(),
				getConfig: vi.fn(),
				setConfig: vi.fn(),
				onVisibilityChange: vi.fn(),
				getServerUrl: () => "http://127.0.0.1:8314",
				getVersion: vi.fn(() => "1.0.0"),
			};

			expect(getServerUrl()).toBe("http://127.0.0.1:8314");
		});

		it("returns empty string when bridge is unavailable", () => {
			delete window.piFleet;

			expect(getServerUrl()).toBe("");
		});
	});

	describe("openInTerminal", () => {
		it("returns success when bridge resolves ok", async () => {
			window.piFleet = {
				openSession: vi.fn().mockResolvedValue({ ok: true }),
				selectDirectory: vi.fn(),
				getConfig: vi.fn(),
				setConfig: vi.fn(),
				onVisibilityChange: vi.fn(),
				getServerUrl: vi.fn(() => "http://127.0.0.1:8314"),
				getVersion: vi.fn(() => "1.0.0"),
			};

			const result = await openInTerminal("session-123");

			expect(result).toEqual({ ok: true });
			expect(window.piFleet!.openSession).toHaveBeenCalledWith("session-123");
		});

		it("returns failure with reason from bridge", async () => {
			window.piFleet = {
				openSession: vi
					.fn()
					.mockResolvedValue({ ok: false, reason: "no-tmux-target" }),
				selectDirectory: vi.fn(),
				getConfig: vi.fn(),
				setConfig: vi.fn(),
				onVisibilityChange: vi.fn(),
				getServerUrl: vi.fn(() => "http://127.0.0.1:8314"),
				getVersion: vi.fn(() => "1.0.0"),
			};

			const result = await openInTerminal("session-123");

			expect(result).toEqual({ ok: false, reason: "no-tmux-target" });
		});

		it("returns bridge-unavailable when bridge is null", async () => {
			delete window.piFleet;

			const result = await openInTerminal("session-123");

			expect(result).toEqual({ ok: false, reason: "bridge-unavailable" });
		});

		it("returns ipc-error when bridge rejects", async () => {
			window.piFleet = {
				openSession: vi.fn().mockRejectedValue(new Error("IPC channel closed")),
				selectDirectory: vi.fn(),
				getConfig: vi.fn(),
				setConfig: vi.fn(),
				onVisibilityChange: vi.fn(),
				getServerUrl: vi.fn(() => "http://127.0.0.1:8314"),
				getVersion: vi.fn(() => "1.0.0"),
			};

			const result = await openInTerminal("session-123");

			expect(result).toEqual({ ok: false, reason: "ipc-error" });
		});
	});

	describe("selectDirectory", () => {
		it("returns selected path when bridge resolves with a string", async () => {
			window.piFleet = {
				openSession: vi.fn(),
				selectDirectory: vi.fn().mockResolvedValue("/Users/dev/projects"),
				getConfig: vi.fn(),
				setConfig: vi.fn(),
				onVisibilityChange: vi.fn(),
				getServerUrl: vi.fn(() => "http://127.0.0.1:8314"),
				getVersion: vi.fn(() => "1.0.0"),
			};

			const result = await selectDirectory();

			expect(result).toBe("/Users/dev/projects");
			expect(window.piFleet.selectDirectory).toHaveBeenCalled();
		});

		it("returns null when bridge resolves with null (user canceled)", async () => {
			window.piFleet = {
				openSession: vi.fn(),
				selectDirectory: vi.fn().mockResolvedValue(null),
				getConfig: vi.fn(),
				setConfig: vi.fn(),
				onVisibilityChange: vi.fn(),
				getServerUrl: vi.fn(() => "http://127.0.0.1:8314"),
				getVersion: vi.fn(() => "1.0.0"),
			};

			const result = await selectDirectory();

			expect(result).toBeNull();
		});

		it("returns null when bridge is unavailable", async () => {
			delete window.piFleet;

			const result = await selectDirectory();

			expect(result).toBeNull();
		});

		it("returns null when bridge rejects (IPC error)", async () => {
			window.piFleet = {
				openSession: vi.fn(),
				selectDirectory: vi
					.fn()
					.mockRejectedValue(new Error("IPC channel closed")),
				getConfig: vi.fn(),
				setConfig: vi.fn(),
				onVisibilityChange: vi.fn(),
				getServerUrl: vi.fn(() => "http://127.0.0.1:8314"),
				getVersion: vi.fn(() => "1.0.0"),
			};

			const result = await selectDirectory();

			expect(result).toBeNull();
		});
	});
});
