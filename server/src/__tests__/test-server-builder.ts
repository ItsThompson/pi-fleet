import { createServer, type PiFleetServer } from "../server.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import type { SessionRegistry } from "../session-registry.js";
import type { PodRegistry } from "../pod-registry.js";
import type { EventBus } from "../event-bus.js";

export interface TestServer {
	server: PiFleetServer;
	sessionRegistry: SessionRegistry;
	podRegistry: PodRegistry;
	eventBus: EventBus;
	cleanup: () => Promise<void>;
}

/**
 * Create a fully configured test server with in-memory state.
 * Handles temp directory creation and cleanup.
 * Call cleanup() in afterEach.
 */
export async function createTestServer(): Promise<TestServer> {
	const tempDir = join(tmpdir(), `pi-fleet-test-${randomUUID()}`);
	mkdirSync(tempDir, { recursive: true });
	const configPath = join(tempDir, "config.json");

	const server = createServer({ port: 0, host: "127.0.0.1", configPath });
	await server.app.ready();

	return {
		server,
		sessionRegistry: server.registry,
		podRegistry: server.podRegistry,
		eventBus: server.eventBus,
		cleanup: async () => {
			await server.stop();
			try {
				rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// ignore cleanup failures in tests
			}
		},
	};
}
