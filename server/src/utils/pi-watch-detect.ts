import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PI_WATCH_EXTENSION_PATH = join(
  homedir(),
  ".pi",
  "agent",
  "extensions",
  "pi-watch",
);

/**
 * Checks if the pi-watch extension is installed at the expected path.
 * This indicates a potential conflict: both pi-watch and pi-fleet would
 * compete for the same port and register duplicate sessions.
 */
export function detectPiWatch(extensionPath?: string): boolean {
  const checkPath = extensionPath ?? PI_WATCH_EXTENSION_PATH;
  return existsSync(checkPath);
}
