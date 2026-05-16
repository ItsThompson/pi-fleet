import type { PiFleetBridge } from "@pi-fleet/shared";

/** Result of attempting to open a session in the terminal. */
export interface OpenTerminalResult {
	ok: boolean;
	reason?: string;
}

/**
 * Access the Electron bridge.
 * Returns null in non-Electron contexts (browser dev mode).
 */
export function getBridge(): PiFleetBridge | null {
	return window.piFleet ?? null;
}

/**
 * Get the server base URL.
 * Returns the bridge URL in Electron, empty string (Vite proxy) in browser.
 */
export function getServerUrl(): string {
	return getBridge()?.getServerUrl() ?? "";
}

/**
 * Open a session's terminal pane.
 * Returns a result indicating success or failure with reason.
 * Never throws.
 */
export async function openInTerminal(
	sessionId: string,
): Promise<OpenTerminalResult> {
	const bridge = getBridge();
	if (!bridge) {
		return { ok: false, reason: "bridge-unavailable" };
	}

	try {
		const result = await bridge.openSession(sessionId);
		return result;
	} catch {
		return { ok: false, reason: "ipc-error" };
	}
}

/**
 * Open a native folder picker dialog.
 * Returns the selected absolute path, or null if canceled or bridge unavailable.
 * Never throws.
 */
export async function selectDirectory(): Promise<string | null> {
	const bridge = getBridge();
	if (!bridge) {
		return null;
	}

	try {
		return await bridge.selectDirectory();
	} catch {
		return null;
	}
}
