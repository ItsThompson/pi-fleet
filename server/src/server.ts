import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { SERVER_PORT } from "@pi-fleet/shared";
import { SessionRegistry } from "./session-registry.js";
import { PodRegistry } from "./pod-registry.js";
import { EventBus } from "./event-bus.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerPodRoutes } from "./routes/pods.js";
import { registerEventsRoute } from "./routes/events.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerOpenTerminalRoute } from "./routes/open-terminal.js";
import { registerClusterRoutes } from "./routes/clusters.js";
import { createClusterStore, type ClusterStore } from "./cluster-store.js";
import { getConfigPath } from "@pi-fleet/shared";
import { log } from "./utils/logger.js";

export interface ServerDeps {
	/** Override the listen port (defaults to SERVER_PORT) */
	port?: number;
	/** Override the host (defaults to 127.0.0.1) */
	host?: string;
	/** Absolute path to client dist directory for static file serving */
	staticDir?: string;
	/** Inject a custom SessionRegistry (for testing) */
	registry?: SessionRegistry;
	/** Inject a custom PodRegistry (for testing) */
	podRegistry?: PodRegistry;
	/** Inject a custom EventBus (for testing) */
	eventBus?: EventBus;
	/** Inject a custom ClusterStore (for testing) */
	clusterStore?: ClusterStore;
	/** Override config path (for testing) */
	configPath?: string;
}

export interface PiFleetServer {
	app: FastifyInstance;
	registry: SessionRegistry;
	podRegistry: PodRegistry;
	eventBus: EventBus;
	clusterStore: ClusterStore;
	start: () => Promise<void>;
	stop: () => Promise<void>;
}

/**
 * Server factory: creates and configures the Fastify instance with all routes.
 * Returns the server instance for testability.
 */
export function createServer(deps: ServerDeps = {}): PiFleetServer {
	const port = deps.port ?? SERVER_PORT;
	const host = deps.host ?? "127.0.0.1";
	const registry = deps.registry ?? new SessionRegistry();
	const podRegistry =
		deps.podRegistry ?? new PodRegistry({ sessionRegistry: registry });
	const eventBus = deps.eventBus ?? new EventBus();
	const configPath = deps.configPath ?? getConfigPath();
	const clusterStore =
		deps.clusterStore ??
		createClusterStore({
			configPath,
			onChange: () => {},
		});
	const startTime = Date.now();

	const app = Fastify({ logger: false });

	// Serve client static files when staticDir is provided
	if (deps.staticDir) {
		app.register(fastifyStatic, {
			root: deps.staticDir,
			prefix: "/",
		});
	}

	// Register routes
	registerSessionRoutes(app, registry);
	registerPodRoutes(app, podRegistry);
	registerEventsRoute(app, eventBus);
	registerHealthRoute(app, registry, podRegistry, startTime);
	registerOpenTerminalRoute(app, registry);
	registerClusterRoutes(app, clusterStore, podRegistry, registry, eventBus);

	// Single event bridge: registry changes → EventBus broadcasts
	registry.onEvent((event) => {
		switch (event.type) {
			case "session:added":
				eventBus.broadcast({ type: "session:added", data: event.session });
				// Re-evaluate pod membership for newly registered sessions
				podRegistry.handleSessionRegistered(event.session.sessionId);
				break;
			case "session:updated":
				eventBus.broadcast({ type: "session:updated", data: event.session });
				// Recompute pod state when session activity changes
				podRegistry.handleSessionUpdated(event.session.sessionId);
				break;
			case "session:removed":
				eventBus.broadcast({
					type: "session:removed",
					data: { sessionId: event.sessionId },
				});
				// Handle pod membership changes on session removal
				podRegistry.handleSessionRemoved(event.sessionId);
				log({
					timestamp: new Date().toISOString(),
					event: "session_reaped",
					sessionId: event.sessionId,
				});
				break;
		}
	});

	// Pod event bridge: pod changes → EventBus broadcasts
	podRegistry.onEvent((event) => {
		switch (event.type) {
			case "pod:formed":
				eventBus.broadcast({ type: "pod:formed", data: event.pod });
				break;
			case "pod:updated":
				eventBus.broadcast({ type: "pod:updated", data: event.pod });
				break;
			case "pod:dissolved":
				eventBus.broadcast({
					type: "pod:dissolved",
					data: { leadSessionId: event.leadSessionId },
				});
				break;
		}
	});

	async function start(): Promise<void> {
		try {
			await app.listen({ port, host });
			registry.startReaper();
			log({
				timestamp: new Date().toISOString(),
				event: "server_started",
				port,
				host,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			log({
				timestamp: new Date().toISOString(),
				event: "server_start_failed",
				port,
				host,
				error: message,
			});
			throw new Error(`Failed to start server on ${host}:${port}: ${message}`);
		}
	}

	async function stop(): Promise<void> {
		clusterStore.dispose();
		registry.dispose();
		await app.close();
		log({
			timestamp: new Date().toISOString(),
			event: "server_stopped",
		});
	}

	return { app, registry, podRegistry, eventBus, clusterStore, start, stop };
}
