import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSSE } from "./useSSE";
import { useSessionStore } from "@/stores/session-store";
import { usePodStore } from "@/stores/pod-store";
import type { RegisteredSession, Pod } from "@pi-fleet/shared";

// Mock EventSource
class MockEventSource {
	static instances: MockEventSource[] = [];
	url: string;
	onopen: ((ev: Event) => void) | null = null;
	onerror: ((ev: Event) => void) | null = null;
	listeners: Map<string, ((event: MessageEvent) => void)[]> = new Map();
	readyState = 0;

	constructor(url: string) {
		this.url = url;
		MockEventSource.instances.push(this);
	}

	addEventListener(type: string, listener: (event: MessageEvent) => void) {
		const existing = this.listeners.get(type) ?? [];
		existing.push(listener);
		this.listeners.set(type, existing);
	}

	removeEventListener() {}

	close() {
		this.readyState = 2;
	}

	// Test helpers
	simulateOpen() {
		this.readyState = 1;
		this.onopen?.(new Event("open"));
	}

	simulateEvent(type: string, data: unknown) {
		const listeners = this.listeners.get(type) ?? [];
		const event = new MessageEvent(type, { data: JSON.stringify(data) });
		listeners.forEach((listener) => listener(event));
	}

	simulateError() {
		this.onerror?.(new Event("error"));
	}
}

// Mock fetch
const mockFetch = vi.fn();

describe("useSSE", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		MockEventSource.instances = [];
		(globalThis as unknown as Record<string, unknown>).EventSource =
			MockEventSource as unknown as typeof EventSource;
		globalThis.fetch = mockFetch;

		useSessionStore.setState({
			sessions: new Map(),
			activityChangedAt: new Map(),
		});
		usePodStore.setState({ pods: new Map() });

		mockFetch.mockImplementation((url: string) => {
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
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("connects to /api/events", () => {
		renderHook(() => useSSE());
		expect(MockEventSource.instances.length).toBe(1);
		expect(MockEventSource.instances[0].url).toBe("/api/events");
	});

	it("reports connected state on open", async () => {
		const { result } = renderHook(() => useSSE());

		act(() => {
			MockEventSource.instances[0].simulateOpen();
		});

		expect(result.current.connected).toBe(true);
		expect(result.current.reconnecting).toBe(false);
	});

	it("processes session:added events", async () => {
		renderHook(() => useSSE());
		const es = MockEventSource.instances[0];

		const session: RegisteredSession = {
			sessionId: "s1",
			pid: 123,
			cwd: "/tmp",
			tmuxTarget: null,
			startTime: "2025-01-01T00:00:00Z",
			activity: "processing",
			lastSeen: "2025-01-01T00:00:00Z",
			lastEventTime: "2025-01-01T00:00:00Z",
		};

		act(() => {
			es.simulateEvent("session:added", session);
		});

		const { sessions } = useSessionStore.getState();
		expect(sessions.get("s1")).toEqual(session);
	});

	it("processes session:updated events", async () => {
		// Pre-populate
		useSessionStore.getState().addSession({
			sessionId: "s1",
			pid: 123,
			cwd: "/tmp",
			tmuxTarget: null,
			startTime: "2025-01-01T00:00:00Z",
			activity: "processing",
			lastSeen: "2025-01-01T00:00:00Z",
			lastEventTime: "2025-01-01T00:00:00Z",
		});

		renderHook(() => useSSE());
		const es = MockEventSource.instances[0];

		act(() => {
			es.simulateEvent("session:updated", {
				sessionId: "s1",
				pid: 123,
				cwd: "/tmp",
				tmuxTarget: null,
				startTime: "2025-01-01T00:00:00Z",
				activity: "idle",
				lastSeen: "2025-01-01T00:01:00Z",
				lastEventTime: "2025-01-01T00:01:00Z",
			});
		});

		const { sessions } = useSessionStore.getState();
		expect(sessions.get("s1")!.activity).toBe("idle");
	});

	it("processes session:removed events", () => {
		useSessionStore.getState().addSession({
			sessionId: "s1",
			pid: 123,
			cwd: "/tmp",
			tmuxTarget: null,
			startTime: "2025-01-01T00:00:00Z",
			activity: "processing",
			lastSeen: "2025-01-01T00:00:00Z",
			lastEventTime: "2025-01-01T00:00:00Z",
		});

		renderHook(() => useSSE());
		const es = MockEventSource.instances[0];

		act(() => {
			es.simulateEvent("session:removed", { sessionId: "s1" });
		});

		expect(useSessionStore.getState().sessions.size).toBe(0);
	});

	it("processes pod:formed events", () => {
		renderHook(() => useSSE());
		const es = MockEventSource.instances[0];

		const pod: Pod = {
			leadSessionId: "lead-1",
			memberSessionIds: ["lead-1", "sub-1"],
			displayName: "my-pod",
			state: "processing",
			attentionCount: 0,
		};

		act(() => {
			es.simulateEvent("pod:formed", pod);
		});

		expect(usePodStore.getState().pods.get("lead-1")).toEqual(pod);
	});

	it("processes pod:dissolved events", () => {
		usePodStore.getState().addOrUpdatePod({
			leadSessionId: "lead-1",
			memberSessionIds: ["lead-1"],
			displayName: "test",
			state: "processing",
			attentionCount: 0,
		});

		renderHook(() => useSSE());
		const es = MockEventSource.instances[0];

		act(() => {
			es.simulateEvent("pod:dissolved", { leadSessionId: "lead-1" });
		});

		expect(usePodStore.getState().pods.size).toBe(0);
	});

	it("enters reconnecting state on error", () => {
		const { result } = renderHook(() => useSSE());
		const es = MockEventSource.instances[0];

		act(() => {
			es.simulateError();
		});

		expect(result.current.connected).toBe(false);
		expect(result.current.reconnecting).toBe(true);
		expect(result.current.attemptCount).toBe(1);
	});

	it("retries with exponential backoff", () => {
		renderHook(() => useSSE());

		// First error
		act(() => {
			MockEventSource.instances[0].simulateError();
		});
		expect(MockEventSource.instances.length).toBe(1);

		// After 1s delay, reconnects
		act(() => {
			vi.advanceTimersByTime(1000);
		});
		expect(MockEventSource.instances.length).toBe(2);

		// Second error
		act(() => {
			MockEventSource.instances[1].simulateError();
		});

		// After 2s delay, reconnects
		act(() => {
			vi.advanceTimersByTime(2000);
		});
		expect(MockEventSource.instances.length).toBe(3);
	});

	it("does not clear sessions during reconnection", () => {
		useSessionStore.getState().addSession({
			sessionId: "keep-me",
			pid: 123,
			cwd: "/tmp",
			tmuxTarget: null,
			startTime: "2025-01-01T00:00:00Z",
			activity: "processing",
			lastSeen: "2025-01-01T00:00:00Z",
			lastEventTime: "2025-01-01T00:00:00Z",
		});

		renderHook(() => useSSE());
		const es = MockEventSource.instances[0];

		act(() => {
			es.simulateError();
		});

		// Sessions should still be present
		expect(useSessionStore.getState().sessions.size).toBe(1);
		expect(useSessionStore.getState().sessions.has("keep-me")).toBe(true);
	});

	it("refetches full state on reconnect via connected event", async () => {
		vi.useRealTimers();

		const sessionData: RegisteredSession = {
			sessionId: "refreshed",
			pid: 1,
			cwd: "/a",
			tmuxTarget: null,
			startTime: "2025-01-01T00:00:00Z",
			activity: "idle",
			lastSeen: "2025-01-01T00:00:00Z",
			lastEventTime: "2025-01-01T00:00:00Z",
		};

		mockFetch.mockImplementation((url: string) => {
			if (url.includes("/api/sessions")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () => Promise.resolve({ sessions: [sessionData] }),
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

		renderHook(() => useSSE());
		const es = MockEventSource.instances[0];

		await act(async () => {
			es.simulateEvent("connected", { serverTime: "2025-01-01T00:00:00Z" });
		});

		await waitFor(() => {
			expect(useSessionStore.getState().sessions.has("refreshed")).toBe(true);
		});
	});
});
