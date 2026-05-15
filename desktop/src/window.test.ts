import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWindowManager, WINDOW_DEFAULTS } from "./window.js";
import type { ConfigManager } from "./config.js";
import type { PiFleetConfig } from "@pi-fleet/shared";

// Mock electron
let lastConstructorOpts: Record<string, unknown> = {};
const mockWindow = {
  loadURL: vi.fn(),
  show: vi.fn(),
  hide: vi.fn(),
  focus: vi.fn(),
  isVisible: vi.fn(() => false),
  isDestroyed: vi.fn(() => false),
  destroy: vi.fn(),
  setIgnoreMouseEvents: vi.fn(),
  setOpacity: vi.fn(),
  once: vi.fn(),
  on: vi.fn(),
  webContents: { send: vi.fn() },
};

vi.mock("electron", () => {
  function BrowserWindow(opts: Record<string, unknown>) {
    lastConstructorOpts = opts;
    return mockWindow;
  }
  BrowserWindow.prototype = {};

  return {
    BrowserWindow,
    screen: {
      getPrimaryDisplay: () => ({
        workAreaSize: { width: 1920, height: 1080 },
      }),
    },
  };
});

function buildConfigManager(
  overrides?: Partial<PiFleetConfig["preferences"]>,
): ConfigManager {
  const config: PiFleetConfig = {
    version: 1,
    preferences: {
      ghostMode: false,
      ghostOpacity: 0.3,
      soundEnabled: true,
      ...overrides,
    },
  };
  return {
    get: () => config,
    set: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("createWindowManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWindow.isVisible.mockReturnValue(false);
  });

  it("createWindow positions window at top-right of screen", () => {
    const manager = createWindowManager({
      configManager: buildConfigManager(),
      preloadPath: "/path/to/preload.cjs",
    });

    manager.createWindow("http://127.0.0.1:8314");

    expect(lastConstructorOpts.x).toBe(1920 - WINDOW_DEFAULTS.width - 12);
    expect(lastConstructorOpts.y).toBe(0);
  });

  it("createWindow sets correct dimensions and constraints", () => {
    const manager = createWindowManager({
      configManager: buildConfigManager(),
      preloadPath: "/path/to/preload.cjs",
    });

    manager.createWindow("http://127.0.0.1:8314");

    expect(lastConstructorOpts.width).toBe(420);
    expect(lastConstructorOpts.height).toBe(680);
    expect(lastConstructorOpts.minWidth).toBe(360);
    expect(lastConstructorOpts.minHeight).toBe(400);
    expect(lastConstructorOpts.maxWidth).toBe(600);
    expect(lastConstructorOpts.maxHeight).toBe(900);
  });

  it("createWindow enables contextIsolation and disables nodeIntegration", () => {
    const manager = createWindowManager({
      configManager: buildConfigManager(),
      preloadPath: "/path/to/preload.cjs",
    });

    manager.createWindow("http://127.0.0.1:8314");

    const webPrefs = lastConstructorOpts.webPreferences as Record<string, unknown>;
    expect(webPrefs.contextIsolation).toBe(true);
    expect(webPrefs.nodeIntegration).toBe(false);
    expect(webPrefs.preload).toBe("/path/to/preload.cjs");
  });

  it("createWindow applies ghost mode if persisted in config", () => {
    const manager = createWindowManager({
      configManager: buildConfigManager({ ghostMode: true, ghostOpacity: 0.5 }),
      preloadPath: "/path/to/preload.cjs",
    });

    manager.createWindow("http://127.0.0.1:8314");

    expect(mockWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true, {
      forward: true,
    });
    expect(mockWindow.setOpacity).toHaveBeenCalledWith(0.5);
  });

  it("toggleVisibility shows hidden window", () => {
    const manager = createWindowManager({
      configManager: buildConfigManager(),
      preloadPath: "/path/to/preload.cjs",
    });
    manager.createWindow("http://127.0.0.1:8314");

    mockWindow.isVisible.mockReturnValue(false);
    manager.toggleVisibility();

    expect(mockWindow.show).toHaveBeenCalled();
    expect(mockWindow.focus).toHaveBeenCalled();
  });

  it("toggleVisibility hides visible window", () => {
    const manager = createWindowManager({
      configManager: buildConfigManager(),
      preloadPath: "/path/to/preload.cjs",
    });
    manager.createWindow("http://127.0.0.1:8314");

    mockWindow.isVisible.mockReturnValue(true);
    manager.toggleVisibility();

    expect(mockWindow.hide).toHaveBeenCalled();
  });

  it("toggleVisibility sends visibility event to renderer", () => {
    const manager = createWindowManager({
      configManager: buildConfigManager(),
      preloadPath: "/path/to/preload.cjs",
    });
    manager.createWindow("http://127.0.0.1:8314");

    mockWindow.isVisible.mockReturnValue(true);
    manager.toggleVisibility();

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      "pf:visibility-changed",
      expect.objectContaining({ visible: expect.any(Boolean) }),
    );
  });

  it("setGhostMode enables ghost mode (click-through + opacity)", () => {
    const configManager = buildConfigManager();
    const manager = createWindowManager({
      configManager,
      preloadPath: "/path/to/preload.cjs",
    });
    manager.createWindow("http://127.0.0.1:8314");
    vi.clearAllMocks();

    manager.setGhostMode(true, 0.4);

    expect(mockWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true, {
      forward: true,
    });
    expect(mockWindow.setOpacity).toHaveBeenCalledWith(0.4);
    expect(configManager.set).toHaveBeenCalledWith("ghostMode", true);
  });

  it("setGhostMode disables ghost mode (restores opacity + mouse events)", () => {
    const configManager = buildConfigManager({ ghostMode: true });
    const manager = createWindowManager({
      configManager,
      preloadPath: "/path/to/preload.cjs",
    });
    manager.createWindow("http://127.0.0.1:8314");
    vi.clearAllMocks();

    manager.setGhostMode(false);

    expect(mockWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(false);
    expect(mockWindow.setOpacity).toHaveBeenCalledWith(1.0);
    expect(configManager.set).toHaveBeenCalledWith("ghostMode", false);
  });

  it("destroy cleans up the BrowserWindow", () => {
    const manager = createWindowManager({
      configManager: buildConfigManager(),
      preloadPath: "/path/to/preload.cjs",
    });
    manager.createWindow("http://127.0.0.1:8314");

    manager.destroy();

    expect(mockWindow.destroy).toHaveBeenCalled();
  });
});
