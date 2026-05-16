import { Tray, Menu, nativeImage, app } from "electron";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { WindowManager } from "./window.js";
import type { ConfigManager } from "./config.js";

export interface TrayManager {
	tray: Tray | null;
	create(): void;
	updateMenu(): void;
	destroy(): void;
}

export interface TrayManagerDeps {
	windowManager: WindowManager;
	configManager: ConfigManager;
	onQuit: () => void;
}

/**
 * Creates and manages the system tray icon and menu.
 * Menu items: Show/Hide, Ghost Mode toggle, Sound toggle, Quit.
 */
export function createTrayManager(deps: TrayManagerDeps): TrayManager {
	const { windowManager, configManager, onQuit } = deps;
	let tray: Tray | null = null;

	function create(): void {
		const iconPath = getTrayIconPath();
		let icon: Electron.NativeImage;
		if (existsSync(iconPath)) {
			icon = nativeImage.createFromPath(iconPath);
			icon.setTemplateImage(true);
		} else {
			// Fallback: create a tiny transparent icon for dev/test
			icon = nativeImage.createEmpty();
		}

		tray = new Tray(icon);
		tray.setToolTip("Pi Fleet");
		updateMenu();
	}

	function updateMenu(): void {
		if (!tray) {
			return;
		}
		const config = configManager.get();

		const contextMenu = Menu.buildFromTemplate([
			{
				label: windowManager.isVisible() ? "Hide" : "Show",
				click: () => {
					windowManager.toggleVisibility();
					updateMenu();
				},
			},
			{ type: "separator" },
			{
				label: "Ghost Mode",
				type: "checkbox",
				checked: config.preferences.ghostMode,
				click: (menuItem) => {
					windowManager.setGhostMode(menuItem.checked);
					updateMenu();
				},
			},
			{
				label: "Sound",
				type: "checkbox",
				checked: config.preferences.soundEnabled,
				click: (menuItem) => {
					configManager.set("soundEnabled", menuItem.checked);
					updateMenu();
				},
			},
			{ type: "separator" },
			{
				label: "Quit",
				click: onQuit,
			},
		]);

		tray.setContextMenu(contextMenu);
	}

	function destroy(): void {
		if (tray) {
			tray.destroy();
			tray = null;
		}
	}

	return {
		get tray() {
			return tray;
		},
		create,
		updateMenu,
		destroy,
	};
}

/**
 * Resolve the tray icon path.
 * In production (packaged): extraResources/assets/trayTemplate.png
 * In development: desktop/assets/trayTemplate.png relative to compiled output
 */
function getTrayIconPath(): string {
	if (app.isPackaged) {
		return join(process.resourcesPath, "assets", "trayTemplate.png");
	}
	// Development: desktop/dist/main.cjs → ../assets/trayTemplate.png
	return join(__dirname, "..", "assets", "trayTemplate.png");
}
