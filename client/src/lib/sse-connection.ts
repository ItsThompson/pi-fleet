/**
 * Framework-agnostic SSE connection manager with exponential backoff.
 * Manages EventSource lifecycle, reconnection, and state change notifications.
 * No React or store dependencies.
 */

export interface SSEConnectionConfig {
	/** SSE endpoint URL (e.g., "http://127.0.0.1:8314/api/events") */
	url: string;
	/** Named event types to listen for */
	eventTypes: string[];
	/** Called when a named event arrives */
	onEvent: (type: string, data: string) => void;
	/** Called when connection state changes */
	onStateChange: (state: ConnectionState) => void;
}

export interface ConnectionState {
	connected: boolean;
	reconnecting: boolean;
	attemptCount: number;
}

export interface SSEConnection {
	/** Initiate connection. Idempotent: closes existing connection first. */
	connect(): void;
	/** Close connection and cancel pending retries. */
	close(): void;
	/** Current connection state snapshot. */
	getState(): ConnectionState;
}

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

function calculateBackoffDelay(attemptCount: number): number {
	return Math.min(
		INITIAL_BACKOFF_MS * Math.pow(2, attemptCount - 1),
		MAX_BACKOFF_MS,
	);
}

/**
 * Create a managed SSE connection with automatic reconnection.
 * Backoff sequence: 1s, 2s, 4s, 8s, 16s, 30s (max), 30s, 30s...
 * Resets attempt counter on successful connection (EventSource onopen).
 */
export function createSSEConnection(
	config: SSEConnectionConfig,
): SSEConnection {
	let eventSource: EventSource | null = null;
	let retryTimeout: ReturnType<typeof setTimeout> | null = null;
	let state: ConnectionState = {
		connected: false,
		reconnecting: false,
		attemptCount: 0,
	};
	let closed = false;

	function setState(next: ConnectionState): void {
		state = next;
		config.onStateChange(state);
	}

	function cleanup(): void {
		if (retryTimeout !== null) {
			clearTimeout(retryTimeout);
			retryTimeout = null;
		}
		if (eventSource !== null) {
			eventSource.close();
			eventSource = null;
		}
	}

	function connect(): void {
		if (closed) return;

		// Idempotent: close existing connection first
		cleanup();

		const es = new EventSource(config.url);
		eventSource = es;

		setState({
			connected: false,
			reconnecting: state.attemptCount > 0,
			attemptCount: state.attemptCount,
		});

		es.onopen = () => {
			if (closed || es !== eventSource) return;
			setState({ connected: true, reconnecting: false, attemptCount: 0 });
		};

		es.onerror = () => {
			if (closed || es !== eventSource) return;

			es.close();
			eventSource = null;

			const nextAttempt = state.attemptCount + 1;
			setState({
				connected: false,
				reconnecting: true,
				attemptCount: nextAttempt,
			});

			const delay = calculateBackoffDelay(nextAttempt);
			retryTimeout = setTimeout(connect, delay);
		};

		config.eventTypes.forEach((type) => {
			es.addEventListener(type, (event: MessageEvent) => {
				if (closed || es !== eventSource) return;
				config.onEvent(type, event.data);
			});
		});
	}

	function close(): void {
		closed = true;
		cleanup();
		setState({
			connected: false,
			reconnecting: false,
			attemptCount: state.attemptCount,
		});
	}

	function getState(): ConnectionState {
		return state;
	}

	return { connect, close, getState };
}
