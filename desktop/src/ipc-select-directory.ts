import { BrowserWindow, dialog, ipcMain } from "electron";

/**
 * Register the pf:select-directory IPC handler.
 * Opens a native macOS folder picker (NSOpenPanel) in openDirectory mode.
 * Returns the selected absolute path, or null if the user canceled.
 */
export function registerSelectDirectoryIPC(): void {
	ipcMain.handle("pf:select-directory", async (): Promise<string | null> => {
		const parentWindow = BrowserWindow.getFocusedWindow();

		const result = parentWindow
			? await dialog.showOpenDialog(parentWindow, {
					properties: ["openDirectory"],
				})
			: await dialog.showOpenDialog({
					properties: ["openDirectory"],
				});

		if (result.canceled || result.filePaths.length === 0) {
			return null;
		}

		return result.filePaths[0];
	});
}
