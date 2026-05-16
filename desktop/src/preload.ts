import { contextBridge, ipcRenderer } from "electron";
import type { PiFleetBridge } from "@pi-fleet/shared";

contextBridge.exposeInMainWorld("piFleet", {
	openSession(sessionId: string) {
		return ipcRenderer.invoke("pf:open-session", { sessionId });
	},

	selectDirectory() {
		return ipcRenderer.invoke("pf:select-directory");
	},

	getConfig() {
		return ipcRenderer.invoke("pf:get-config");
	},

	setConfig(key: string, value: unknown) {
		return ipcRenderer.invoke("pf:set-config", { key, value });
	},

	onVisibilityChange(callback: (visible: boolean) => void): () => void {
		const handler = (
			_event: Electron.IpcRendererEvent,
			payload: { visible: boolean },
		) => {
			callback(payload.visible);
		};
		ipcRenderer.on("pf:visibility-changed", handler);
		return () => {
			ipcRenderer.removeListener("pf:visibility-changed", handler);
		};
	},

	getServerUrl(): string {
		// Server URL is injected via a query param or env during window creation.
		// For the embedded server, always localhost.
		return `http://127.0.0.1:8314`;
	},

	getVersion(): string {
		// Electron provides this from package.json
		return process.env.APP_VERSION ?? "0.1.0";
	},
} satisfies PiFleetBridge);
