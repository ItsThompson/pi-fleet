import { BrowserWindow, screen } from "electron";
import type { ConfigManager } from "./config.js";

/** Window dimension constraints per spec (10-nonfunctional.md) */
export const WINDOW_DEFAULTS = {
	width: 600,
	height: 680,
	minWidth: 360,
	minHeight: 500,
	maxWidth: 800,
	maxHeight: 900,
} as const;

export interface WindowManager {
	window: BrowserWindow | null;
	createWindow(serverUrl: string): BrowserWindow;
	toggleVisibility(): void;
	setGhostMode(enabled: boolean, opacity?: number): void;
	isVisible(): boolean;
	destroy(): void;
}

export interface WindowManagerDeps {
	configManager: ConfigManager;
	preloadPath: string;
}

/**
 * Creates and manages the menu-bar overlay BrowserWindow.
 * Handles positioning (anchored near tray), ghost mode, and visibility toggle.
 */
export function createWindowManager(deps: WindowManagerDeps): WindowManager {
	const { configManager, preloadPath } = deps;
	let window: BrowserWindow | null = null;
	let visible = false;

	/**
	 * Apply the visual state based on visibility and ghost mode.
	 * Visibility is controlled purely via opacity to avoid triggering
	 * AeroSpace's window-added/removed focus logic.
	 */
	function applyVisualState(): void {
		if (!window) return;
		const config = configManager.get();
		const ghostEnabled = config.preferences.ghostMode;
		const ghostOpacity = config.preferences.ghostOpacity;

		if (!visible) {
			window.setOpacity(0);
			window.setIgnoreMouseEvents(true);
		} else if (ghostEnabled) {
			window.setOpacity(ghostOpacity);
			window.setIgnoreMouseEvents(true, { forward: true });
		} else {
			window.setOpacity(1);
			window.setIgnoreMouseEvents(false);
		}
	}

	function getAnchorPosition(): { x: number; y: number } {
		const primaryDisplay = screen.getPrimaryDisplay();
		const { width: screenWidth } = primaryDisplay.workAreaSize;
		const x = screenWidth - WINDOW_DEFAULTS.width - 12;
		const y = 0;
		return { x, y };
	}

	function createWindow(serverUrl: string): BrowserWindow {
		const { x, y } = getAnchorPosition();

		window = new BrowserWindow({
			x,
			y,
			width: WINDOW_DEFAULTS.width,
			height: WINDOW_DEFAULTS.height,
			minWidth: WINDOW_DEFAULTS.minWidth,
			minHeight: WINDOW_DEFAULTS.minHeight,
			maxWidth: WINDOW_DEFAULTS.maxWidth,
			maxHeight: WINDOW_DEFAULTS.maxHeight,
			resizable: true,
			movable: true,
			frame: false,
			show: false,
			alwaysOnTop: true,
			skipTaskbar: true,
			type: "panel",
			backgroundColor: "#09090b",
			webPreferences: {
				contextIsolation: true,
				nodeIntegration: false,
				preload: preloadPath,
			},
		});

		window.loadURL(serverUrl);

		// Show the window once so it permanently exists in the OS window list.
		// Visibility is then controlled purely via opacity to avoid triggering
		// AeroSpace's window-added/removed focus logic.
		window.once("ready-to-show", () => {
			window?.showInactive();
			visible = true;
			applyVisualState();
		});

		// Intercept close to hide via opacity instead of destroying
		window.on("close", (e) => {
			e.preventDefault();
			visible = false;
			applyVisualState();
		});

		window.on("closed", () => {
			window = null;
		});

		return window;
	}

	function toggleVisibility(): void {
		if (!window) {
			return;
		}
		visible = !visible;
		applyVisualState();
		window.webContents.send("pf:visibility-changed", { visible });
	}

	function setGhostMode(enabled: boolean, opacity?: number): void {
		if (!window) {
			return;
		}
		if (opacity !== undefined) {
			configManager.set("ghostOpacity", opacity);
		}
		configManager.set("ghostMode", enabled);
		applyVisualState();
	}

	function isVisible(): boolean {
		return visible;
	}

	function destroy(): void {
		if (window && !window.isDestroyed()) {
			window.destroy();
			window = null;
		}
	}

	return {
		get window() {
			return window;
		},
		createWindow,
		toggleVisibility,
		setGhostMode,
		isVisible,
		destroy,
	};
}
