import { SERVER_PORT } from "@pi-fleet/shared";

const BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;

/**
 * Event bus interface matching pi.events.
 * Minimized to what PodReporter needs.
 */
export interface PodReporterEventBus {
	on(event: string, handler: (data?: unknown) => void): void;
	emit(event: string, data?: unknown): void;
}

export interface PodReporterDeps {
	events: PodReporterEventBus;
	sessionId: string;
	/** Injectable fetch for testing. Defaults to global fetch. */
	fetchFn?: typeof fetch;
}

interface RegistryResponsePayload {
	subagentIds: string[];
}

/**
 * Inter-extension protocol handler for pod ownership reporting.
 *
 * Listens for signals from subagent-orchestrator, requests the registry state,
 * and posts ownership to the server.
 *
 * Protocol:
 * 1. subagent-orchestrator emits "subagent-orchestrator:registry-updated" (signal)
 * 2. PodReporter emits "pi-fleet:request-subagent-registry" (request)
 * 3. subagent-orchestrator responds with "subagent-orchestrator:registry-response" (data)
 * 4. PodReporter POSTs ownership to server
 */
export function createPodReporter(deps: PodReporterDeps) {
	const { events, sessionId } = deps;
	const fetchFn = deps.fetchFn ?? globalThis.fetch;

	async function postOwnership(subagentIds: string[]): Promise<void> {
		try {
			await fetchFn(`${BASE_URL}/api/pods/ownership`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ parentSessionId: sessionId, subagentIds }),
				signal: AbortSignal.timeout(5000),
			});
		} catch {
			// Graceful degradation: server may not be running
		}
	}

	// Listen for the signal: "something changed in the subagent registry"
	events.on("subagent-orchestrator:registry-updated", () => {
		events.emit("pi-fleet:request-subagent-registry", undefined);
	});

	// Listen for the response: "here are the current subagent IDs"
	events.on("subagent-orchestrator:registry-response", (data: unknown) => {
		const payload = data as RegistryResponsePayload;
		if (payload?.subagentIds && Array.isArray(payload.subagentIds)) {
			postOwnership(payload.subagentIds);
		}
	});

	return {
		/** Request current state (called on session_start for startup catch-up) */
		requestInitialState(): void {
			events.emit("pi-fleet:request-subagent-registry", undefined);
		},
	};
}
