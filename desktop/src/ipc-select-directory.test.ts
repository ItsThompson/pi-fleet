import { describe, it, expect, vi, beforeEach } from "vitest";

const mockShowOpenDialog = vi.fn();
const mockHandle = vi.fn();

vi.mock("electron", () => ({
	dialog: {
		showOpenDialog: (...args: unknown[]) => mockShowOpenDialog(...args),
	},
	ipcMain: {
		handle: (...args: unknown[]) => mockHandle(...args),
	},
}));

import { registerSelectDirectoryIPC } from "./ipc-select-directory.js";

/**
 * Unit test for the select-directory IPC handler logic.
 * Tests the dialog interaction without Electron runtime.
 */
describe("ipc-select-directory handler logic", () => {
	beforeEach(() => {
		mockShowOpenDialog.mockReset();
		mockHandle.mockReset();
	});

	it("calls dialog.showOpenDialog with openDirectory property", async () => {
		mockShowOpenDialog.mockResolvedValue({
			canceled: false,
			filePaths: ["/Users/dev/projects"],
		});

		registerSelectDirectoryIPC();

		// Extract the handler that was registered
		const [channel, handler] = mockHandle.mock.calls[0];
		expect(channel).toBe("pf:select-directory");

		await handler({} as Electron.IpcMainInvokeEvent);

		expect(mockShowOpenDialog).toHaveBeenCalledWith({
			properties: ["openDirectory"],
		});
	});

	it("returns selected path when user selects a folder", async () => {
		mockShowOpenDialog.mockResolvedValue({
			canceled: false,
			filePaths: ["/Users/dev/projects"],
		});

		registerSelectDirectoryIPC();

		const handler = mockHandle.mock.calls[0][1];
		const result = await handler({} as Electron.IpcMainInvokeEvent);

		expect(result).toBe("/Users/dev/projects");
	});

	it("returns null when dialog is canceled", async () => {
		mockShowOpenDialog.mockResolvedValue({
			canceled: true,
			filePaths: [],
		});

		registerSelectDirectoryIPC();

		const handler = mockHandle.mock.calls[0][1];
		const result = await handler({} as Electron.IpcMainInvokeEvent);

		expect(result).toBeNull();
	});
});
