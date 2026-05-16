import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSSERefetch, type SSERefetchConfig } from "./sse-refetch";
import { useSessionStore } from "@/stores/session-store";
import { usePodStore } from "@/stores/pod-store";
import { useClusterStore } from "@/stores/cluster-store";

function createMockConfig(
	overrides?: Partial<SSERefetchConfig>,
): SSERefetchConfig {
	return {
		baseUrl: "http://localhost:8314",
		dispatch: vi.fn(),
		debounceMs: 100,
		gatingTimeoutMs: 5000,
		...overrides,
	};
}

function mockSuccessfulFetch() {
	return vi.fn().mockImplementation((url: string) => {
		if (url.includes("/api/sessions")) {
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () =>
					Promise.resolve({
						sessions: [
							{
								sessionId: "s1",
								pid: 1,
								cwd: "/tmp",
								tmuxTarget: null,
								startTime: "2025-01-01T00:00:00Z",
								activity: "idle",
								lastSeen: "2025-01-01T00:00:00Z",
								lastEventTime: "2025-01-01T00:00:00Z",
							},
						],
					}),
			});
		}
		if (url.includes("/api/pods")) {
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () =>
					Promise.resolve({
						pods: [
							{
								leadSessionId: "lead-1",
								memberSessionIds: ["lead-1"],
								displayName: "pod-1",
								state: "idle",
								attentionCount: 0,
							},
						],
					}),
			});
		}
		if (url.includes("/api/clusters")) {
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () =>
					Promise.resolve({
						clusters: [
							{
								id: "c1",
								name: "Cluster 1",
								directories: ["/project"],
								sortOrder: 0,
								podIds: ["lead-1"],
								attentionCount: 0,
							},
						],
						unclustered: { podIds: [], attentionCount: 0 },
					}),
			});
		}
		return Promise.resolve({ ok: false, status: 404 });
	});
}

describe("sse-refetch", () => {
	let mockFetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		mockFetch = mockSuccessfulFetch();
		globalThis.fetch = mockFetch as unknown as typeof fetch;

		useSessionStore.setState({
			sessions: new Map(),
			activityChangedAt: new Map(),
		});
		usePodStore.setState({ pods: new Map() });
		useClusterStore.setState({
			clusters: [],
			unclustered: { podIds: [], attentionCount: 0 },
		});

		vi.spyOn(console, "debug").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("createSSERefetch", () => {
		it("returns an SSERefetch instance with all required methods", () => {
			const refetch = createSSERefetch(createMockConfig());

			expect(refetch.refetchAll).toBeTypeOf("function");
			expect(refetch.refetchClusters).toBeTypeOf("function");
			expect(refetch.isGating).toBeTypeOf("function");
			expect(refetch.queueEvent).toBeTypeOf("function");
			expect(refetch.dispose).toBeTypeOf("function");

			refetch.dispose();
		});

		it("starts with gating disabled", () => {
			const refetch = createSSERefetch(createMockConfig());

			expect(refetch.isGating()).toBe(false);

			refetch.dispose();
		});
	});

	describe("refetchClusters debounce", () => {
		it("collapses N calls within debounceMs into exactly 1 fetch", async () => {
			const refetch = createSSERefetch(createMockConfig());

			// Call 5 times rapidly
			refetch.refetchClusters();
			refetch.refetchClusters();
			refetch.refetchClusters();
			refetch.refetchClusters();
			refetch.refetchClusters();

			// No fetch yet (still within debounce window)
			expect(mockFetch).not.toHaveBeenCalled();

			// Advance past debounce
			vi.advanceTimersByTime(100);

			// Exactly 1 fetch to /api/clusters
			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:8314/api/clusters",
				expect.objectContaining({ signal: expect.any(AbortSignal) }),
			);

			refetch.dispose();
		});

		it("resets timer on each new call (trailing edge)", async () => {
			const refetch = createSSERefetch(createMockConfig());

			refetch.refetchClusters();
			vi.advanceTimersByTime(80); // 80ms elapsed

			refetch.refetchClusters(); // Resets the timer
			vi.advanceTimersByTime(80); // 80ms from second call (160ms total)

			// Still no fetch: 80ms from second call < 100ms debounce
			expect(mockFetch).not.toHaveBeenCalled();

			vi.advanceTimersByTime(20); // Now 100ms from second call

			expect(mockFetch).toHaveBeenCalledTimes(1);

			refetch.dispose();
		});

		it("fires a second fetch for a new burst after debounce completes", () => {
			const refetch = createSSERefetch(createMockConfig());

			// First burst
			refetch.refetchClusters();
			vi.advanceTimersByTime(100);
			expect(mockFetch).toHaveBeenCalledTimes(1);

			// Second burst (200ms after first)
			refetch.refetchClusters();
			vi.advanceTimersByTime(100);
			expect(mockFetch).toHaveBeenCalledTimes(2);

			refetch.dispose();
		});
	});

	describe("refetchClusters abort", () => {
		it("aborts in-flight request when a new refetch fires", async () => {
			const abortSignals: AbortSignal[] = [];
			mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
				if (init?.signal) {
					abortSignals.push(init.signal);
				}
				// Never resolves: simulates slow request
				return new Promise(() => {});
			});

			const refetch = createSSERefetch(createMockConfig());

			// First call
			refetch.refetchClusters();
			vi.advanceTimersByTime(100);
			expect(abortSignals).toHaveLength(1);
			expect(abortSignals[0].aborted).toBe(false);

			// Second call (aborts first)
			refetch.refetchClusters();
			vi.advanceTimersByTime(100);
			expect(abortSignals).toHaveLength(2);
			expect(abortSignals[0].aborted).toBe(true); // First aborted
			expect(abortSignals[1].aborted).toBe(false); // Second still active

			refetch.dispose();
		});

		it("silently swallows AbortError exceptions", async () => {
			const warnSpy = vi.spyOn(console, "warn");
			mockFetch.mockRejectedValue(new DOMException("Aborted", "AbortError"));

			const refetch = createSSERefetch(createMockConfig());

			refetch.refetchClusters();
			vi.advanceTimersByTime(100);

			// Let the promise rejection settle
			await vi.advanceTimersByTimeAsync(0);

			// No warning logged for AbortError
			expect(warnSpy).not.toHaveBeenCalledWith(
				expect.stringContaining("failed"),
				expect.any(DOMException),
			);

			refetch.dispose();
		});
	});

	describe("refetchAll gating", () => {
		it("enables gating when refetchAll starts", async () => {
			mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
			const refetch = createSSERefetch(createMockConfig());

			refetch.refetchAll();
			expect(refetch.isGating()).toBe(true);

			refetch.dispose();
		});

		it("disables gating when refetchAll completes successfully", async () => {
			const refetch = createSSERefetch(createMockConfig());

			await refetch.refetchAll();
			expect(refetch.isGating()).toBe(false);

			refetch.dispose();
		});

		it("disables gating when refetchAll fails", async () => {
			mockFetch.mockRejectedValue(new Error("Network error"));
			const refetch = createSSERefetch(createMockConfig());

			await refetch.refetchAll();
			expect(refetch.isGating()).toBe(false);

			refetch.dispose();
		});

		it("disables gating on partial failure (non-200 response)", async () => {
			mockFetch.mockImplementation((url: string) => {
				if (url.includes("/api/sessions")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve({ sessions: [] }),
					});
				}
				if (url.includes("/api/pods")) {
					return Promise.resolve({ ok: false, status: 500 });
				}
				if (url.includes("/api/clusters")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve({ clusters: [] }),
					});
				}
				return Promise.resolve({ ok: false, status: 404 });
			});

			const refetch = createSSERefetch(createMockConfig());

			await refetch.refetchAll();
			expect(refetch.isGating()).toBe(false);

			refetch.dispose();
		});

		it("fetches sessions, pods, and clusters in parallel", async () => {
			const refetch = createSSERefetch(createMockConfig());

			await refetch.refetchAll();

			const fetchedUrls = mockFetch.mock.calls.map(
				(call: unknown[]) => call[0],
			);
			expect(fetchedUrls).toContain("http://localhost:8314/api/sessions");
			expect(fetchedUrls).toContain("http://localhost:8314/api/pods");
			expect(fetchedUrls).toContain("http://localhost:8314/api/clusters");

			refetch.dispose();
		});

		it("applies data atomically on success", async () => {
			const refetch = createSSERefetch(createMockConfig());

			await refetch.refetchAll();

			expect(useSessionStore.getState().sessions.size).toBe(1);
			expect(usePodStore.getState().pods.size).toBe(1);
			expect(useClusterStore.getState().clusters).toHaveLength(1);

			refetch.dispose();
		});

		it("does not apply partial data on failure", async () => {
			// Pre-populate stores with existing data
			useSessionStore.getState().addSession({
				sessionId: "existing",
				pid: 99,
				cwd: "/old",
				tmuxTarget: null,
				startTime: "2025-01-01T00:00:00Z",
				activity: "processing",
				lastSeen: "2025-01-01T00:00:00Z",
				lastEventTime: "2025-01-01T00:00:00Z",
			});

			mockFetch.mockImplementation((url: string) => {
				if (url.includes("/api/sessions")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve({ sessions: [] }),
					});
				}
				// Pods fail
				if (url.includes("/api/pods")) {
					return Promise.resolve({ ok: false, status: 500 });
				}
				if (url.includes("/api/clusters")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve({ clusters: [] }),
					});
				}
				return Promise.resolve({ ok: false, status: 404 });
			});

			const refetch = createSSERefetch(createMockConfig());

			await refetch.refetchAll();

			// Store retains previous data
			expect(useSessionStore.getState().sessions.has("existing")).toBe(true);

			refetch.dispose();
		});

		it("logs warning on partial failure with status codes", async () => {
			const warnSpy = vi.spyOn(console, "warn");
			mockFetch.mockImplementation((url: string) => {
				if (url.includes("/api/sessions")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve({ sessions: [] }),
					});
				}
				if (url.includes("/api/pods")) {
					return Promise.resolve({ ok: false, status: 503 });
				}
				if (url.includes("/api/clusters")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve({ clusters: [] }),
					});
				}
				return Promise.resolve({ ok: false, status: 404 });
			});

			const refetch = createSSERefetch(createMockConfig());

			await refetch.refetchAll();

			expect(warnSpy).toHaveBeenCalledWith(
				"SSE refetchAll: partial failure",
				expect.objectContaining({ pods: 503 }),
			);

			refetch.dispose();
		});
	});

	describe("event queue and replay", () => {
		it("queues events when gating is active", async () => {
			mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
			const dispatch = vi.fn();
			const refetch = createSSERefetch(createMockConfig({ dispatch }));

			refetch.refetchAll(); // Starts gating
			expect(refetch.isGating()).toBe(true);

			refetch.queueEvent("session:added", '{"sessionId":"s2"}');
			refetch.queueEvent("pod:formed", '{"leadSessionId":"l1"}');

			// Events not dispatched yet
			expect(dispatch).not.toHaveBeenCalled();

			refetch.dispose();
		});

		it("replays queued events in order after refetch completes", async () => {
			const dispatch = vi.fn();
			const refetch = createSSERefetch(createMockConfig({ dispatch }));

			// Start refetch (will enable gating, then complete)
			const refetchPromise = refetch.refetchAll();

			// Queue events while gating
			refetch.queueEvent("session:added", '{"sessionId":"s2"}');
			refetch.queueEvent("session:updated", '{"sessionId":"s2"}');
			refetch.queueEvent("pod:formed", '{"leadSessionId":"l1"}');

			// Complete the refetch
			await refetchPromise;

			// Events replayed in order
			expect(dispatch).toHaveBeenCalledTimes(3);
			expect(dispatch).toHaveBeenNthCalledWith(
				1,
				"session:added",
				'{"sessionId":"s2"}',
			);
			expect(dispatch).toHaveBeenNthCalledWith(
				2,
				"session:updated",
				'{"sessionId":"s2"}',
			);
			expect(dispatch).toHaveBeenNthCalledWith(
				3,
				"pod:formed",
				'{"leadSessionId":"l1"}',
			);

			refetch.dispose();
		});

		it("replays queued events even on refetch failure", async () => {
			mockFetch.mockRejectedValue(new Error("Network error"));
			const dispatch = vi.fn();
			const refetch = createSSERefetch(createMockConfig({ dispatch }));

			const refetchPromise = refetch.refetchAll();
			refetch.queueEvent("session:added", '{"sessionId":"s2"}');

			await refetchPromise;

			expect(dispatch).toHaveBeenCalledTimes(1);
			expect(dispatch).toHaveBeenCalledWith(
				"session:added",
				'{"sessionId":"s2"}',
			);

			refetch.dispose();
		});

		it("clears queue after replay", async () => {
			const dispatch = vi.fn();
			const refetch = createSSERefetch(createMockConfig({ dispatch }));

			await refetch.refetchAll(); // No events queued: nothing to replay

			// Second refetch
			const secondPromise = refetch.refetchAll();
			refetch.queueEvent("session:added", '{"sessionId":"s3"}');
			await secondPromise;

			// Only the new event was replayed (queue cleared after first replay)
			expect(dispatch).toHaveBeenCalledTimes(1);
			expect(dispatch).toHaveBeenCalledWith(
				"session:added",
				'{"sessionId":"s3"}',
			);

			refetch.dispose();
		});
	});

	describe("gating safety timeout", () => {
		it("disables gating after timeout (5s default)", async () => {
			mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
			const dispatch = vi.fn();
			const refetch = createSSERefetch(createMockConfig({ dispatch }));

			refetch.refetchAll();
			expect(refetch.isGating()).toBe(true);

			refetch.queueEvent("session:added", '{"sessionId":"s2"}');

			// Advance to just before timeout
			vi.advanceTimersByTime(4999);
			expect(refetch.isGating()).toBe(true);

			// Advance past timeout
			vi.advanceTimersByTime(1);
			expect(refetch.isGating()).toBe(false);

			// Queued events were replayed
			expect(dispatch).toHaveBeenCalledWith(
				"session:added",
				'{"sessionId":"s2"}',
			);

			refetch.dispose();
		});

		it("logs error when safety timeout fires", async () => {
			const errorSpy = vi.spyOn(console, "error");
			mockFetch.mockImplementation(() => new Promise(() => {}));
			const refetch = createSSERefetch(createMockConfig());

			refetch.refetchAll();
			vi.advanceTimersByTime(5000);

			expect(errorSpy).toHaveBeenCalledWith(
				"SSE refetch: gating safety timeout reached, forcing disable",
			);

			refetch.dispose();
		});

		it("respects custom gatingTimeoutMs", async () => {
			mockFetch.mockImplementation(() => new Promise(() => {}));
			const refetch = createSSERefetch(
				createMockConfig({ gatingTimeoutMs: 2000 }),
			);

			refetch.refetchAll();
			vi.advanceTimersByTime(1999);
			expect(refetch.isGating()).toBe(true);

			vi.advanceTimersByTime(1);
			expect(refetch.isGating()).toBe(false);

			refetch.dispose();
		});

		it("does not fire timeout if refetch completes first", async () => {
			const errorSpy = vi.spyOn(console, "error");
			const refetch = createSSERefetch(createMockConfig());

			await refetch.refetchAll();

			// Advance well past timeout
			vi.advanceTimersByTime(10000);

			expect(errorSpy).not.toHaveBeenCalled();

			refetch.dispose();
		});

		it("aborts in-flight refetchAll when timeout fires so stale data cannot apply", async () => {
			let resolveDelayedFetch: (() => void) | null = null;
			let capturedSignal: AbortSignal | null = null;

			mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
				capturedSignal = init?.signal ?? null;
				return new Promise((resolve) => {
					resolveDelayedFetch = () =>
						resolve({
							ok: true,
							status: 200,
							json: () =>
								Promise.resolve({ sessions: [], pods: [], clusters: [] }),
						});
				});
			});

			const refetch = createSSERefetch(createMockConfig());

			refetch.refetchAll();
			expect(capturedSignal).not.toBeNull();
			expect(capturedSignal!.aborted).toBe(false);

			// Timeout fires: should abort the controller
			vi.advanceTimersByTime(5000);
			expect(capturedSignal!.aborted).toBe(true);

			refetch.dispose();
		});
	});

	describe("dispose", () => {
		it("cancels pending debounce timers", () => {
			const refetch = createSSERefetch(createMockConfig());

			refetch.refetchClusters();
			refetch.dispose();

			// Advance past debounce: no fetch should fire
			vi.advanceTimersByTime(200);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it("aborts in-flight cluster requests", () => {
			let capturedSignal: AbortSignal | null = null;
			mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
				capturedSignal = init?.signal ?? null;
				return new Promise(() => {});
			});

			const refetch = createSSERefetch(createMockConfig());

			refetch.refetchClusters();
			vi.advanceTimersByTime(100); // Trigger the fetch
			expect(capturedSignal).not.toBeNull();
			expect(capturedSignal!.aborted).toBe(false);

			refetch.dispose();
			expect(capturedSignal!.aborted).toBe(true);
		});

		it("aborts in-flight refetchAll requests", async () => {
			const capturedSignals: AbortSignal[] = [];
			mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
				if (init?.signal) {
					capturedSignals.push(init.signal);
				}
				return new Promise(() => {});
			});

			const refetch = createSSERefetch(createMockConfig());

			refetch.refetchAll();
			// 3 parallel requests
			expect(capturedSignals).toHaveLength(3);

			refetch.dispose();
			capturedSignals.forEach((signal) => {
				expect(signal.aborted).toBe(true);
			});
		});

		it("prevents further operations after dispose", () => {
			const refetch = createSSERefetch(createMockConfig());

			refetch.dispose();

			refetch.refetchClusters();
			vi.advanceTimersByTime(200);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it("cancels gating timeout timer", () => {
			const errorSpy = vi.spyOn(console, "error");
			mockFetch.mockImplementation(() => new Promise(() => {}));
			const refetch = createSSERefetch(createMockConfig());

			refetch.refetchAll();
			refetch.dispose();

			// Advance past timeout: should NOT fire
			vi.advanceTimersByTime(10000);
			expect(errorSpy).not.toHaveBeenCalled();
		});
	});

	describe("refetchAll aborts pending cluster refetch", () => {
		it("aborts in-flight cluster refetch when refetchAll starts", async () => {
			let clusterSignal: AbortSignal | null = null;
			mockFetch.mockImplementation((url: string, init?: RequestInit) => {
				if (url.includes("/api/clusters") && !clusterSignal) {
					clusterSignal = init?.signal ?? null;
					return new Promise(() => {}); // First cluster fetch never resolves
				}
				// All other fetches succeed
				if (url.includes("/api/sessions")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve({ sessions: [] }),
					});
				}
				if (url.includes("/api/pods")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve({ pods: [] }),
					});
				}
				if (url.includes("/api/clusters")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								clusters: [],
								unclustered: { podIds: [], attentionCount: 0 },
							}),
					});
				}
				return Promise.resolve({ ok: false, status: 404 });
			});

			const refetch = createSSERefetch(createMockConfig());

			// Start a cluster refetch
			refetch.refetchClusters();
			vi.advanceTimersByTime(100);
			expect(clusterSignal).not.toBeNull();
			expect(clusterSignal!.aborted).toBe(false);

			// refetchAll should abort the cluster refetch
			await refetch.refetchAll();
			expect(clusterSignal!.aborted).toBe(true);

			refetch.dispose();
		});

		it("clears debounce timer when refetchAll starts", async () => {
			const refetch = createSSERefetch(createMockConfig());

			// Start debounce
			refetch.refetchClusters();
			// refetchAll before debounce fires
			await refetch.refetchAll();

			// Advance past debounce: the debounced cluster refetch should NOT fire
			vi.advanceTimersByTime(200);

			// Only the 3 parallel fetches from refetchAll
			expect(mockFetch).toHaveBeenCalledTimes(3);

			refetch.dispose();
		});
	});
});
