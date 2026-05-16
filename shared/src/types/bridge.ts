/** Contract between Electron preload and renderer-side consumers. */
export interface PiFleetBridge {
	openSession(sessionId: string): Promise<{ ok: boolean; reason?: string }>;
	getConfig(): Promise<{
		version: 1;
		preferences: {
			ghostMode: boolean;
			ghostOpacity: number;
			soundEnabled: boolean;
		};
	}>;
	setConfig(key: string, value: unknown): Promise<void>;
	onVisibilityChange(callback: (visible: boolean) => void): () => void;
	getServerUrl(): string;
	getVersion(): string;
}
