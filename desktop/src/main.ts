import { app, globalShortcut, ipcMain, Notification } from "electron";
import { join } from "node:path";
import { createConfigManager } from "./config.js";
import { createWindowManager } from "./window.js";
import { createTrayManager } from "./tray.js";
import { createEmbeddedServer } from "./server.js";
import { createSoundManager } from "./sound.js";
import { registerOpenSessionIPC } from "./ipc-open-session.js";
import { registerSelectDirectoryIPC } from "./ipc-select-directory.js";

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
	app.quit();
}

// Hide dock icon (menu-bar app on macOS)
app.dock?.hide();

app.whenReady().then(async () => {
	const configManager = createConfigManager();
	const server = createEmbeddedServer();
	const soundManager = createSoundManager({ configManager });

	// Step 1: Start embedded server before window loads
	const serverStarted = await server.start();
	if (!serverStarted) {
		// App remains open: user can retry via the dialog or quit.
		// Don't crash. Register tray so they can quit gracefully.
		const windowManager = createWindowManager({
			configManager,
			preloadPath: getPreloadPath(),
		});
		const trayManager = createTrayManager({
			windowManager,
			configManager,
			onQuit: () =>
				shutdown(
					server,
					configManager,
					soundManager,
					trayManager,
					windowManager,
				),
		});
		trayManager.create();
		return;
	}

	// Step 2: Wire sound alerts to session state changes
	wireSessionSoundAlerts(server, soundManager);

	// Step 3: Create window manager and BrowserWindow
	const windowManager = createWindowManager({
		configManager,
		preloadPath: getPreloadPath(),
	});

	const clientUrl = getClientUrl(server.getUrl());
	windowManager.createWindow(clientUrl);

	// Step 4: Create tray
	const trayManager = createTrayManager({
		windowManager,
		configManager,
		onQuit: () =>
			shutdown(server, configManager, soundManager, trayManager, windowManager),
	});
	trayManager.create();

	// Step 5: Register global shortcut (F5 toggle)
	registerGlobalShortcut(windowManager);

	// Step 6: Register IPC handlers
	registerOpenSessionIPC();
	registerSelectDirectoryIPC();
	registerConfigIPC(configManager);

	// Handle second instance attempts
	app.on("second-instance", () => {
		windowManager.toggleVisibility();
	});
});

// macOS: keep app running when all windows closed (menu-bar app pattern)
app.on("window-all-closed", () => {
	// Do not quit: menu-bar app stays alive via tray
});

/**
 * Register F5 global shortcut for overlay toggle.
 * If registration fails, notify the user.
 */
function registerGlobalShortcut(windowManager: {
	toggleVisibility(): void;
}): void {
	const registered = globalShortcut.register("F5", () => {
		windowManager.toggleVisibility();
	});

	if (!registered) {
		new Notification({
			title: "PiFleet",
			body: "Could not register F5 shortcut. Use the tray menu to show/hide.",
		}).show();
	}
}

/**
 * Register IPC handlers for config get/set.
 */
function registerConfigIPC(
	configManager: ReturnType<typeof createConfigManager>,
): void {
	ipcMain.handle("pf:get-config", () => {
		return configManager.get();
	});

	ipcMain.handle(
		"pf:set-config",
		(_event, payload: { key: string; value: unknown }) => {
			configManager.set(payload.key, payload.value);
		},
	);
}

/**
 * Wire the server's session registry events to the sound manager.
 * Sound fires when any session transitions to pending_approval or idle.
 */
function wireSessionSoundAlerts(
	server: ReturnType<typeof createEmbeddedServer>,
	soundManager: ReturnType<typeof createSoundManager>,
): void {
	const instance = server.instance;
	if (!instance) {
		return;
	}

	instance.registry.onEvent((event) => {
		if (event.type === "session:added") {
			soundManager.handleStateChange(
				event.session.sessionId,
				event.session.activity,
			);
		}
		if (event.type === "session:updated") {
			soundManager.handleStateChange(
				event.session.sessionId,
				event.session.activity,
			);
		}
	});
}

/**
 * Resolve the preload script path.
 * In dev: built alongside main.ts in dist/.
 * In production: same dist directory.
 */
function getPreloadPath(): string {
	return join(__dirname, "preload.cjs");
}

/**
 * Resolve the client URL.
 * Embedded server serves the client static files via @fastify/static.
 * Falls back to localhost URL for dev mode.
 */
function getClientUrl(serverUrl: string): string {
	return serverUrl;
}

/**
 * Graceful shutdown: stop server, save config, destroy resources.
 */
async function shutdown(
	server: ReturnType<typeof createEmbeddedServer>,
	configManager: ReturnType<typeof createConfigManager>,
	soundManager: ReturnType<typeof createSoundManager>,
	trayManager: { destroy(): void },
	windowManager: { destroy(): void },
): Promise<void> {
	globalShortcut.unregisterAll();
	soundManager.dispose();
	configManager.dispose();
	trayManager.destroy();
	windowManager.destroy();
	await server.stop();
	app.quit();
}
