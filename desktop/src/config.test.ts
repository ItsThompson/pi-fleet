import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, saveConfig, createConfigManager } from "./config.js";
import type { PiFleetConfig } from "@pi-fleet/shared";

describe("loadConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-fleet-config-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns defaults when file does not exist", () => {
    const config = loadConfig(join(tempDir, "nonexistent.json"));
    expect(config).toEqual({
      version: 1,
      preferences: {
        ghostMode: false,
        ghostOpacity: 0.3,
        soundEnabled: true,
      },
    });
  });

  it("returns defaults when file contains invalid JSON", () => {
    const filePath = join(tempDir, "config.json");
    require("node:fs").writeFileSync(filePath, "not json {{{");
    const config = loadConfig(filePath);
    expect(config.version).toBe(1);
    expect(config.preferences.ghostMode).toBe(false);
  });

  it("loads valid config from disk", () => {
    const filePath = join(tempDir, "config.json");
    const stored: PiFleetConfig = {
      version: 1,
      preferences: {
        ghostMode: true,
        ghostOpacity: 0.5,
        soundEnabled: false,
      },
    };
    require("node:fs").writeFileSync(filePath, JSON.stringify(stored));
    const config = loadConfig(filePath);
    expect(config.preferences.ghostMode).toBe(true);
    expect(config.preferences.ghostOpacity).toBe(0.5);
    expect(config.preferences.soundEnabled).toBe(false);
  });

  it("fills in missing preference fields with defaults", () => {
    const filePath = join(tempDir, "config.json");
    const partial = { version: 1, preferences: { ghostMode: true } };
    require("node:fs").writeFileSync(filePath, JSON.stringify(partial));
    const config = loadConfig(filePath);
    expect(config.preferences.ghostMode).toBe(true);
    expect(config.preferences.ghostOpacity).toBe(0.3);
    expect(config.preferences.soundEnabled).toBe(true);
  });

  it("migrates unversioned config to defaults", () => {
    const filePath = join(tempDir, "config.json");
    require("node:fs").writeFileSync(
      filePath,
      JSON.stringify({ someLegacy: true }),
    );
    const config = loadConfig(filePath);
    expect(config.version).toBe(1);
    expect(config.preferences.ghostMode).toBe(false);
  });
});

describe("saveConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-fleet-config-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes config as formatted JSON", () => {
    const filePath = join(tempDir, "config.json");
    const config: PiFleetConfig = {
      version: 1,
      preferences: {
        ghostMode: true,
        ghostOpacity: 0.7,
        soundEnabled: false,
      },
    };
    saveConfig(config, filePath);
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.preferences.ghostOpacity).toBe(0.7);
  });

  it("creates nested directories if they do not exist", () => {
    const filePath = join(tempDir, "nested", "deep", "config.json");
    const config: PiFleetConfig = {
      version: 1,
      preferences: { ghostMode: false, ghostOpacity: 0.3, soundEnabled: true },
    };
    saveConfig(config, filePath);
    const raw = readFileSync(filePath, "utf-8");
    expect(JSON.parse(raw).version).toBe(1);
  });
});

describe("createConfigManager", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-fleet-config-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("get() returns current config", () => {
    const filePath = join(tempDir, "config.json");
    const manager = createConfigManager(filePath);
    const config = manager.get();
    expect(config.version).toBe(1);
    expect(config.preferences.ghostMode).toBe(false);
    manager.dispose();
  });

  it("set() updates a preference value", () => {
    const filePath = join(tempDir, "config.json");
    const manager = createConfigManager(filePath);
    manager.set("ghostMode", true);
    expect(manager.get().preferences.ghostMode).toBe(true);
    manager.dispose();
  });

  it("dispose() flushes pending save to disk", () => {
    const filePath = join(tempDir, "config.json");
    const manager = createConfigManager(filePath);
    manager.set("soundEnabled", false);
    manager.dispose();
    const raw = readFileSync(filePath, "utf-8");
    expect(JSON.parse(raw).preferences.soundEnabled).toBe(false);
  });

  it("ignores unknown keys", () => {
    const filePath = join(tempDir, "config.json");
    const manager = createConfigManager(filePath);
    manager.set("unknownKey", "value");
    expect((manager.get().preferences as Record<string, unknown>)["unknownKey"]).toBeUndefined();
    manager.dispose();
  });
});
