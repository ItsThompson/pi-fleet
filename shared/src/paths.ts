import { homedir } from "node:os";
import { join } from "node:path";

const APP_NAME = "PiFleet";

/**
 * Returns the path to the PiFleet config directory.
 * macOS: ~/Library/Application Support/PiFleet/
 */
export function getConfigDir(): string {
	return join(homedir(), "Library", "Application Support", APP_NAME);
}

/**
 * Returns the path to the PiFleet config file.
 * macOS: ~/Library/Application Support/PiFleet/config.json
 */
export function getConfigPath(): string {
	return join(getConfigDir(), "config.json");
}

/**
 * Returns the path to the PiFleet log directory.
 * macOS: ~/Library/Logs/PiFleet/
 */
export function getLogDir(): string {
	return join(homedir(), "Library", "Logs", APP_NAME);
}

/**
 * Returns the path to the PiFleet log file.
 * macOS: ~/Library/Logs/PiFleet/pi-fleet.log
 */
export function getLogPath(): string {
	return join(getLogDir(), "pi-fleet.log");
}
