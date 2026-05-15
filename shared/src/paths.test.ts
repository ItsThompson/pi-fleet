import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { getConfigDir, getConfigPath, getLogDir, getLogPath } from "./paths.js";

describe("paths", () => {
  const home = homedir();

  it("getConfigDir returns macOS Application Support path", () => {
    expect(getConfigDir()).toBe(
      join(home, "Library", "Application Support", "PiFleet"),
    );
  });

  it("getConfigPath returns config.json inside config dir", () => {
    expect(getConfigPath()).toBe(
      join(home, "Library", "Application Support", "PiFleet", "config.json"),
    );
  });

  it("getLogDir returns macOS Logs path", () => {
    expect(getLogDir()).toBe(join(home, "Library", "Logs", "PiFleet"));
  });

  it("getLogPath returns pi-fleet.log inside log dir", () => {
    expect(getLogPath()).toBe(
      join(home, "Library", "Logs", "PiFleet", "pi-fleet.log"),
    );
  });
});
