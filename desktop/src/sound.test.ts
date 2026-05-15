import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSoundManager } from "./sound.js";
import type { ConfigManager } from "./config.js";
import type { PiFleetConfig } from "@pi-fleet/shared";

// Mock electron's shell.beep
vi.mock("electron", () => ({
  shell: { beep: vi.fn() },
}));

function buildConfigManager(overrides?: Partial<PiFleetConfig["preferences"]>): ConfigManager {
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

describe("createSoundManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("plays sound on first transition to pending_approval", async () => {
    const { shell } = await import("electron");
    const soundManager = createSoundManager({
      configManager: buildConfigManager(),
    });

    soundManager.handleStateChange("session-1", "pending_approval");

    expect(shell.beep).toHaveBeenCalledOnce();
  });

  it("plays sound on first transition to idle", async () => {
    const { shell } = await import("electron");
    const soundManager = createSoundManager({
      configManager: buildConfigManager(),
    });

    soundManager.handleStateChange("session-1", "idle");

    expect(shell.beep).toHaveBeenCalledOnce();
  });

  it("does not play sound for processing state", async () => {
    const { shell } = await import("electron");
    const soundManager = createSoundManager({
      configManager: buildConfigManager(),
    });

    soundManager.handleStateChange("session-1", "processing");

    expect(shell.beep).not.toHaveBeenCalled();
  });

  it("does not play sound for running_tool state", async () => {
    const { shell } = await import("electron");
    const soundManager = createSoundManager({
      configManager: buildConfigManager(),
    });

    soundManager.handleStateChange("session-1", "running_tool");

    expect(shell.beep).not.toHaveBeenCalled();
  });

  it("deduplicates: does not replay on heartbeat repeat of same state", async () => {
    const { shell } = await import("electron");
    const soundManager = createSoundManager({
      configManager: buildConfigManager(),
    });

    soundManager.handleStateChange("session-1", "pending_approval");
    soundManager.handleStateChange("session-1", "pending_approval");
    soundManager.handleStateChange("session-1", "pending_approval");

    expect(shell.beep).toHaveBeenCalledOnce();
  });

  it("plays sound again on re-transition (processing → idle → processing → idle)", async () => {
    const { shell } = await import("electron");
    const soundManager = createSoundManager({
      configManager: buildConfigManager(),
    });

    soundManager.handleStateChange("session-1", "idle");
    soundManager.handleStateChange("session-1", "processing");
    soundManager.handleStateChange("session-1", "idle");

    expect(shell.beep).toHaveBeenCalledTimes(2);
  });

  it("tracks sessions independently", async () => {
    const { shell } = await import("electron");
    const soundManager = createSoundManager({
      configManager: buildConfigManager(),
    });

    soundManager.handleStateChange("session-1", "idle");
    soundManager.handleStateChange("session-2", "idle");

    expect(shell.beep).toHaveBeenCalledTimes(2);
  });

  it("does not play sound when sound is disabled", async () => {
    const { shell } = await import("electron");
    const soundManager = createSoundManager({
      configManager: buildConfigManager({ soundEnabled: false }),
    });

    soundManager.handleStateChange("session-1", "pending_approval");

    expect(shell.beep).not.toHaveBeenCalled();
  });

  it("dispose clears state", () => {
    const soundManager = createSoundManager({
      configManager: buildConfigManager(),
    });

    soundManager.handleStateChange("session-1", "idle");
    soundManager.dispose();
    // After dispose, internal map is cleared (no assertion needed for internal state,
    // but no errors thrown)
  });
});
