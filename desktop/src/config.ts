import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { PiFleetConfig } from "@pi-fleet/shared";
import { getConfigPath, getConfigDir } from "@pi-fleet/shared";

const DEFAULT_CONFIG: PiFleetConfig = {
	version: 1,
	preferences: {
		ghostMode: false,
		ghostOpacity: 0.3,
		soundEnabled: true,
	},
};

/**
 * Load config from disk. Returns defaults if file doesn't exist or is invalid.
 */
export function loadConfig(configPath?: string): PiFleetConfig {
	const filePath = configPath ?? getConfigPath();
	try {
		const raw = readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw) as Partial<PiFleetConfig>;
		if (!parsed.version || parsed.version !== 1) {
			return migrateConfig(parsed);
		}
		return {
			version: 1,
			preferences: {
				ghostMode:
					parsed.preferences?.ghostMode ?? DEFAULT_CONFIG.preferences.ghostMode,
				ghostOpacity:
					parsed.preferences?.ghostOpacity ??
					DEFAULT_CONFIG.preferences.ghostOpacity,
				soundEnabled:
					parsed.preferences?.soundEnabled ??
					DEFAULT_CONFIG.preferences.soundEnabled,
			},
		};
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

/**
 * Save config to disk. Creates directory if it doesn't exist.
 * File permissions: 0o600 (owner read/write only).
 */
export function saveConfig(config: PiFleetConfig, configPath?: string): void {
	const filePath = configPath ?? getConfigPath();
	const dir = dirname(filePath);
	mkdirSync(dir, { recursive: true });
	writeFileSync(filePath, JSON.stringify(config, null, 2), {
		mode: 0o600,
		encoding: "utf-8",
	});
}

/**
 * Migrate older config formats to current version.
 * Currently only version 1 exists, so any unrecognized format gets defaults.
 */
function migrateConfig(_old: unknown): PiFleetConfig {
	return { ...DEFAULT_CONFIG };
}

/**
 * Managed config instance: load/get/set with auto-save debouncing.
 */
export interface ConfigManager {
	get(): PiFleetConfig;
	set(key: string, value: unknown): void;
	dispose(): void;
}

export function createConfigManager(configPath?: string): ConfigManager {
	const filePath = configPath ?? getConfigPath();
	let config = loadConfig(filePath);
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;

	function scheduleSave(): void {
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}
		saveTimeout = setTimeout(() => {
			saveConfig(config, filePath);
			saveTimeout = null;
		}, 500);
	}

	return {
		get(): PiFleetConfig {
			return config;
		},

		set(key: string, value: unknown): void {
			if (key in config.preferences) {
				(config.preferences as Record<string, unknown>)[key] = value;
				scheduleSave();
			}
		},

		dispose(): void {
			if (saveTimeout) {
				clearTimeout(saveTimeout);
				// Flush pending save synchronously
				saveConfig(config, filePath);
			}
		},
	};
}
