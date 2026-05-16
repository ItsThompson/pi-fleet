/**
 * DEV-MODE ONLY: Patches the local Electron binary's Info.plist.
 *
 * Why: In production, electron-builder applies LSUIElement: true via the
 * "extendInfo" config in package.json, so the packaged .app works correctly.
 * But in dev mode we run the generic Electron binary from node_modules which
 * lacks that plist entry. Without it, macOS exposes our window to tiling
 * window managers (e.g. AeroSpace) as a regular window instead of ignoring it.
 *
 * What: Adds LSUIElement: true to the dev Electron.app's Info.plist.
 * When: Runs on postinstall (after npm install) and before each dev launch.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const plist = resolve(
	__dirname,
	"../../node_modules/electron/dist/Electron.app/Contents/Info.plist",
);

if (!existsSync(plist)) {
	console.log("[patch-electron-plist] Electron.app not found, skipping.");
	process.exit(0);
}

try {
	execSync(
		`/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "${plist}" 2>/dev/null || /usr/libexec/PlistBuddy -c "Set :LSUIElement true" "${plist}"`,
	);
	console.log("[patch-electron-plist] LSUIElement: true applied.");
} catch {
	console.warn("[patch-electron-plist] Failed to patch plist (non-macOS?).");
}
