/**
 * SSE Refetch Stabilization Module
 *
 * Provides three capabilities:
 * 1. Trailing debounce (100ms) for burst-collapsing cluster refetches
 * 2. AbortController for cancelling superseded requests
 * 3. Event gating with queued replay for reconnect scenarios
 *
 * Framework-agnostic: no React, no hooks. useSSE.ts is the integration point.
 */
import { useSessionStore } from "@/stores/session-store";
import { usePodStore } from "@/stores/pod-store";
import { useClusterStore } from "@/stores/cluster-store";
import type { RegisteredSession, Pod } from "@pi-fleet/shared";
import type { ClusterWithPods, UnclusteredState } from "@/stores/cluster-store";

export interface SSERefetchConfig {
	/** Base URL for API calls (e.g., "http://127.0.0.1:8314") */
	baseUrl: string;
	/** Dispatcher function for replaying queued events after gating ends */
	dispatch: (eventType: string, rawData: string) => void;
	/** Debounce window in ms for cluster refetches (default: 100) */
	debounceMs?: number;
	/** Gating safety timeout in ms (default: 5000) */
	gatingTimeoutMs?: number;
}

export interface QueuedEvent {
	eventType: string;
	rawData: string;
	receivedAt: number;
}

export interface SSERefetch {
	/** Trigger a full state refetch (sessions + pods + clusters). Gates events. */
	refetchAll(): Promise<void>;
	/** Trigger a clusters-only refetch. Debounced and abort-managed. */
	refetchClusters(): void;
	/** Check whether event gating is active. */
	isGating(): boolean;
	/** Queue an event during gating. */
	queueEvent(eventType: string, rawData: string): void;
	/** Cleanup: cancel pending debounces, abort in-flight fetches. */
	dispose(): void;
}

const DEFAULT_DEBOUNCE_MS = 100;
const DEFAULT_GATING_TIMEOUT_MS = 5000;

export function createSSERefetch(config: SSERefetchConfig): SSERefetch {
	const debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	const gatingTimeoutMs = config.gatingTimeoutMs ?? DEFAULT_GATING_TIMEOUT_MS;

	let gating = false;
	let eventQueue: QueuedEvent[] = [];
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let clusterController: AbortController | null = null;
	let refetchAllController: AbortController | null = null;
	let gatingTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
	let disposed = false;

	function isGating(): boolean {
		return gating;
	}

	function queueEvent(eventType: string, rawData: string): void {
		eventQueue.push({
			eventType,
			rawData,
			receivedAt: Date.now(),
		});
	}

	function replayQueue(): void {
		const queue = eventQueue;
		eventQueue = [];
		queue.forEach((event) => {
			config.dispatch(event.eventType, event.rawData);
		});
	}

	function disableGating(): void {
		gating = false;
		if (gatingTimeoutTimer !== null) {
			clearTimeout(gatingTimeoutTimer);
			gatingTimeoutTimer = null;
		}
		replayQueue();
	}

	function startGatingTimeout(): void {
		gatingTimeoutTimer = setTimeout(() => {
			if (gating) {
				console.error(
					"SSE refetch: gating safety timeout reached, forcing disable",
				);
				// Abort in-flight refetchAll so stale data can't overwrite replayed events
				if (refetchAllController) {
					refetchAllController.abort();
					refetchAllController = null;
				}
				disableGating();
			}
		}, gatingTimeoutMs);
	}

	async function refetchAll(): Promise<void> {
		if (disposed) {
			return;
		}

		// Enable gating
		gating = true;
		startGatingTimeout();

		// Abort any in-flight cluster refetch
		if (clusterController) {
			clusterController.abort();
			clusterController = null;
		}
		// Clear cluster debounce timer
		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}

		// Abort any previous refetchAll
		if (refetchAllController) {
			refetchAllController.abort();
		}
		const controller = new AbortController();
		refetchAllController = controller;

		console.debug("SSE refetchAll: start");

		try {
			const [sessionsRes, podsRes, clustersRes] = await Promise.all([
				fetch(`${config.baseUrl}/api/sessions`, {
					signal: controller.signal,
				}),
				fetch(`${config.baseUrl}/api/pods`, { signal: controller.signal }),
				fetch(`${config.baseUrl}/api/clusters`, {
					signal: controller.signal,
				}),
			]);

			if (controller.signal.aborted) {
				return;
			}

			// All-or-nothing: if any endpoint fails, keep current state
			if (!sessionsRes.ok || !podsRes.ok || !clustersRes.ok) {
				console.warn("SSE refetchAll: partial failure", {
					sessions: sessionsRes.status,
					pods: podsRes.status,
					clusters: clustersRes.status,
				});
				return;
			}

			const [sessionsData, podsData, clustersData] = await Promise.all([
				sessionsRes.json(),
				podsRes.json(),
				clustersRes.json(),
			]);

			if (controller.signal.aborted) {
				return;
			}

			// Atomic apply: all stores update together
			useSessionStore
				.getState()
				.setSessions((sessionsData.sessions ?? []) as RegisteredSession[]);
			usePodStore.getState().setPods((podsData.pods ?? []) as Pod[]);
			useClusterStore.getState().setClusters(
				(clustersData.clusters ?? []) as ClusterWithPods[],
				(clustersData.unclustered ?? {
					podIds: [],
					attentionCount: 0,
				}) as UnclusteredState,
			);

			console.debug("SSE refetchAll: complete");
		} catch (error: unknown) {
			if (error instanceof DOMException && error.name === "AbortError") {
				return; // Expected: superseded
			}
			console.warn("SSE refetchAll: failed", error);
		} finally {
			if (refetchAllController === controller) {
				refetchAllController = null;
			}
			// Always disable gating (success or failure) unless already disposed/aborted
			if (!disposed && gating) {
				disableGating();
			}
		}
	}

	function executeClusterRefetch(): void {
		if (disposed) {
			return;
		}

		// Abort any in-flight cluster request
		if (clusterController) {
			clusterController.abort();
		}
		const controller = new AbortController();
		clusterController = controller;

		console.debug("SSE refetchClusters: start");

		fetch(`${config.baseUrl}/api/clusters`, { signal: controller.signal })
			.then(async (response) => {
				if (controller.signal.aborted) {
					return;
				}
				if (!response.ok) {
					console.warn("SSE refetchClusters: failed", response.status);
					return;
				}
				const data = await response.json();
				if (controller.signal.aborted) {
					return;
				}

				useClusterStore.getState().setClusters(
					(data.clusters ?? []) as ClusterWithPods[],
					(data.unclustered ?? {
						podIds: [],
						attentionCount: 0,
					}) as UnclusteredState,
				);
				console.debug("SSE refetchClusters: complete");
			})
			.catch((error: unknown) => {
				if (error instanceof DOMException && error.name === "AbortError") {
					return; // Expected: superseded
				}
				console.warn("SSE refetchClusters: failed", error);
			})
			.finally(() => {
				if (clusterController === controller) {
					clusterController = null;
				}
			});
	}

	function refetchClusters(): void {
		if (disposed) {
			return;
		}

		// Clear existing debounce timer (trailing edge reset)
		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
		}

		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			executeClusterRefetch();
		}, debounceMs);
	}

	function dispose(): void {
		disposed = true;

		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
		if (gatingTimeoutTimer !== null) {
			clearTimeout(gatingTimeoutTimer);
			gatingTimeoutTimer = null;
		}
		if (clusterController) {
			clusterController.abort();
			clusterController = null;
		}
		if (refetchAllController) {
			refetchAllController.abort();
			refetchAllController = null;
		}

		gating = false;
		eventQueue = [];
	}

	return {
		refetchAll,
		refetchClusters,
		isGating,
		queueEvent,
		dispose,
	};
}
