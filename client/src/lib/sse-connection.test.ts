import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	createSSEConnection,
	type ConnectionState,
	type SSEConnection,
} from "./sse-connection";

/**
 * Minimal EventSource mock that exposes lifecycle hooks and event listeners.
 * Tests trigger behaviors by calling instance methods directly.
 */
class MockEventSource {
	static instances: MockEventSource[] = [];

	url: string;
	onopen: (() => void) | null = null;
	onerror: (() => void) | null = null;
	listeners: Map<string, ((event: MessageEvent) => void)[]> = new Map();
	closed = false;

	constructor(url: string) {
		this.url = url;
		MockEventSource.instances.push(this);
	}

	addEventListener(type: string, handler: (event: MessageEvent) => void): void {
		const existing = this.listeners.get(type) ?? [];
		existing.push(handler);
		this.listeners.set(type, existing);
	}

	close(): void {
		this.closed = true;
	}

	/** Simulate a successful connection open */
	simulateOpen(): void {
		this.onopen?.();
	}

	/** Simulate a connection error */
	simulateError(): void {
		this.onerror?.();
	}

	/** Simulate receiving a named event */
	simulateEvent(type: string, data: string): void {
		const handlers = this.listeners.get(type) ?? [];
		const messageEvent = { data } as MessageEvent;
		handlers.forEach((handler) => handler(messageEvent));
	}
}

describe("sse-connection", () => {
	let onEvent: ReturnType<typeof vi.fn<(type: string, data: string) => void>>;
	let onStateChange: ReturnType<typeof vi.fn<(state: ConnectionState) => void>>;
	let connection: SSEConnection;
	const originalEventSource = globalThis.EventSource;

	beforeEach(() => {
		vi.useFakeTimers();
		MockEventSource.instances = [];
		// @ts-expect-error -- replacing global EventSource with mock
		globalThis.EventSource = MockEventSource;

		onEvent = vi.fn();
		onStateChange = vi.fn();
	});

	afterEach(() => {
		connection?.close();
		vi.useRealTimers();
		globalThis.EventSource = originalEventSource;
	});

	function createConnection(
		overrides?: Partial<Parameters<typeof createSSEConnection>[0]>,
	) {
		connection = createSSEConnection({
			url: "http://localhost:8314/api/events",
			eventTypes: [
				"session:added",
				"session:updated",
				"heartbeat",
				"connected",
			],
			onEvent,
			onStateChange,
			...overrides,
		});
		return connection;
	}

	function getLatestEventSource(): MockEventSource {
		return MockEventSource.instances[MockEventSource.instances.length - 1];
	}

	describe("successful connection", () => {
		it("creates an EventSource with the configured URL", () => {
			createConnection();
			connection.connect();

			const es = getLatestEventSource();
			expect(es.url).toBe("http://localhost:8314/api/events");
		});

		it("reports connected state after onopen fires", () => {
			createConnection();
			connection.connect();

			const es = getLatestEventSource();
			es.simulateOpen();

			expect(connection.getState()).toEqual({
				connected: true,
				reconnecting: false,
				attemptCount: 0,
			});
		});

		it("fires onStateChange on successful open", () => {
			createConnection();
			connection.connect();

			const es = getLatestEventSource();
			es.simulateOpen();

			expect(onStateChange).toHaveBeenCalledWith({
				connected: true,
				reconnecting: false,
				attemptCount: 0,
			});
		});
	});

	describe("event routing", () => {
		it("routes named events to onEvent callback with type and raw data", () => {
			createConnection();
			connection.connect();

			const es = getLatestEventSource();
			es.simulateOpen();
			es.simulateEvent("session:added", '{"sessionId":"abc"}');

			expect(onEvent).toHaveBeenCalledWith(
				"session:added",
				'{"sessionId":"abc"}',
			);
		});

		it("routes multiple event types independently", () => {
			createConnection();
			connection.connect();

			const es = getLatestEventSource();
			es.simulateOpen();
			es.simulateEvent("session:added", '{"id":"1"}');
			es.simulateEvent("heartbeat", "{}");

			expect(onEvent).toHaveBeenCalledTimes(2);
			expect(onEvent).toHaveBeenCalledWith("session:added", '{"id":"1"}');
			expect(onEvent).toHaveBeenCalledWith("heartbeat", "{}");
		});

		it("does not route events after close()", () => {
			createConnection();
			connection.connect();

			const es = getLatestEventSource();
			es.simulateOpen();
			connection.close();

			es.simulateEvent("session:added", '{"id":"1"}');

			// onEvent should not be called after close
			expect(onEvent).not.toHaveBeenCalledWith(
				"session:added",
				expect.anything(),
			);
		});
	});

	describe("error triggers reconnection with backoff", () => {
		it("transitions to reconnecting state on error", () => {
			createConnection();
			connection.connect();

			const es = getLatestEventSource();
			es.simulateError();

			expect(connection.getState()).toEqual({
				connected: false,
				reconnecting: true,
				attemptCount: 1,
			});
		});

		it("closes the EventSource on error", () => {
			createConnection();
			connection.connect();

			const es = getLatestEventSource();
			es.simulateError();

			expect(es.closed).toBe(true);
		});

		it("reconnects after 1s on first error", () => {
			createConnection();
			connection.connect();

			const es = getLatestEventSource();
			es.simulateError();

			expect(MockEventSource.instances).toHaveLength(1);

			vi.advanceTimersByTime(1000);

			expect(MockEventSource.instances).toHaveLength(2);
		});

		it("uses exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)", () => {
			createConnection();
			connection.connect();

			const expectedDelays = [1000, 2000, 4000, 8000, 16000, 30000, 30000];

			expectedDelays.forEach((delay, index) => {
				const es = getLatestEventSource();
				es.simulateError();

				expect(connection.getState().attemptCount).toBe(index + 1);

				// Should NOT have reconnected yet
				vi.advanceTimersByTime(delay - 1);
				const countBefore = MockEventSource.instances.length;

				vi.advanceTimersByTime(1);
				expect(MockEventSource.instances.length).toBe(countBefore + 1);
			});
		});

		it("caps backoff at 30s", () => {
			createConnection();
			connection.connect();

			// Simulate 10 consecutive errors
			for (let i = 0; i < 10; i++) {
				const es = getLatestEventSource();
				es.simulateError();
				vi.advanceTimersByTime(30_000);
			}

			// After many attempts, state reflects the count
			expect(connection.getState().attemptCount).toBe(10);
		});
	});

	describe("attempt counter resets on successful connection", () => {
		it("resets attemptCount to 0 when onopen fires after reconnection", () => {
			createConnection();
			connection.connect();

			// First connection fails
			const es1 = getLatestEventSource();
			es1.simulateError();
			expect(connection.getState().attemptCount).toBe(1);

			// Wait for reconnect
			vi.advanceTimersByTime(1000);

			// Second connection succeeds
			const es2 = getLatestEventSource();
			es2.simulateOpen();

			expect(connection.getState()).toEqual({
				connected: true,
				reconnecting: false,
				attemptCount: 0,
			});
		});
	});

	describe("close() cancels retries", () => {
		it("cancels pending retry timer when close() is called", () => {
			createConnection();
			connection.connect();

			const es = getLatestEventSource();
			es.simulateError();

			// Timer is pending for reconnect
			connection.close();

			// Advance past the reconnect delay
			vi.advanceTimersByTime(5000);

			// Should NOT have created a new EventSource
			expect(MockEventSource.instances).toHaveLength(1);
		});

		it("closes the active EventSource", () => {
			createConnection();
			connection.connect();

			const es = getLatestEventSource();
			es.simulateOpen();

			connection.close();

			expect(es.closed).toBe(true);
		});

		it("fires onStateChange with connected: false on close", () => {
			createConnection();
			connection.connect();

			const es = getLatestEventSource();
			es.simulateOpen();

			onStateChange.mockClear();
			connection.close();

			expect(onStateChange).toHaveBeenCalledWith(
				expect.objectContaining({ connected: false, reconnecting: false }),
			);
		});
	});

	describe("connect() is idempotent", () => {
		it("closes existing connection when connect() is called again", () => {
			createConnection();
			connection.connect();

			const es1 = getLatestEventSource();
			es1.simulateOpen();

			// Connect again while already connected
			connection.connect();

			expect(es1.closed).toBe(true);
			expect(MockEventSource.instances).toHaveLength(2);
		});

		it("cancels pending retry timer on reconnect", () => {
			createConnection();
			connection.connect();

			const es1 = getLatestEventSource();
			es1.simulateError();

			// Retry is pending. Call connect() manually.
			connection.connect();

			// Advance past the original retry time
			vi.advanceTimersByTime(5000);

			// Should only have 2 instances: original + manual reconnect (no retry)
			expect(MockEventSource.instances).toHaveLength(2);
		});

		it("is a no-op after close()", () => {
			createConnection();
			connection.connect();

			const es = getLatestEventSource();
			es.simulateOpen();

			connection.close();

			// Attempt to connect after close: should not create a new EventSource
			connection.connect();

			expect(MockEventSource.instances).toHaveLength(1);
		});
	});

	describe("onStateChange fires on lifecycle transitions", () => {
		it("fires on initial connect (connecting state)", () => {
			createConnection();
			connection.connect();

			expect(onStateChange).toHaveBeenCalledWith(
				expect.objectContaining({ connected: false, reconnecting: false }),
			);
		});

		it("fires on successful open", () => {
			createConnection();
			connection.connect();
			const es = getLatestEventSource();
			es.simulateOpen();

			expect(onStateChange).toHaveBeenCalledWith(
				expect.objectContaining({
					connected: true,
					reconnecting: false,
					attemptCount: 0,
				}),
			);
		});

		it("fires on error/reconnecting", () => {
			createConnection();
			connection.connect();
			const es = getLatestEventSource();
			es.simulateError();

			expect(onStateChange).toHaveBeenCalledWith(
				expect.objectContaining({
					connected: false,
					reconnecting: true,
					attemptCount: 1,
				}),
			);
		});

		it("fires on close", () => {
			createConnection();
			connection.connect();
			const es = getLatestEventSource();
			es.simulateOpen();

			onStateChange.mockClear();
			connection.close();

			expect(onStateChange).toHaveBeenCalledWith(
				expect.objectContaining({ connected: false, reconnecting: false }),
			);
		});
	});
});
