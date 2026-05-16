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

  function getAnchorPosition(): { x: number; y: number } {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;
    const x = screenWidth - WINDOW_DEFAULTS.width - 12;
    const y = 0;
    return { x, y };
  }

  function createWindow(serverUrl: string): BrowserWindow {
    const { x, y } = getAnchorPosition();
    const config = configManager.get();

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
      backgroundColor: "#09090b",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: preloadPath,
      },
    });

    window.loadURL(serverUrl);

    // Apply persisted ghost mode on creation
    if (config.preferences.ghostMode) {
      applyGhostMode(window, true, config.preferences.ghostOpacity);
    }

    window.once("ready-to-show", () => {
      window?.show();
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
    if (window.isVisible()) {
      window.hide();
    } else {
      window.show();
      window.focus();
    }
    window.webContents.send("pf:visibility-changed", {
      visible: window.isVisible(),
    });
  }

  function setGhostMode(enabled: boolean, opacity?: number): void {
    if (!window) {
      return;
    }
    const resolvedOpacity =
      opacity ?? configManager.get().preferences.ghostOpacity;
    applyGhostMode(window, enabled, resolvedOpacity);
    configManager.set("ghostMode", enabled);
  }

  function isVisible(): boolean {
    return window?.isVisible() ?? false;
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

/**
 * Apply or remove ghost mode (translucent + click-through).
 * Uses setIgnoreMouseEvents with forward option so the renderer still
 * receives mouse position for hover effects.
 */
function applyGhostMode(
  win: BrowserWindow,
  enabled: boolean,
  opacity: number,
): void {
  if (enabled) {
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setOpacity(opacity);
  } else {
    win.setIgnoreMouseEvents(false);
    win.setOpacity(1.0);
  }
}
