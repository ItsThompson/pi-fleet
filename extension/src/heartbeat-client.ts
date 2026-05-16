import {
  SERVER_PORT,
  HEARTBEAT_INTERVAL_MS,
  type RegisterBody,
  type HeartbeatBody,
} from "@pi-fleet/shared";

const BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;
const FAILURE_THRESHOLD = 3;
const MAX_BACKOFF_MS = 30_000;

export interface HeartbeatClientDeps {
  /** Injectable fetch for testing. Defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** Injectable timer for testing. Defaults to setInterval/clearInterval. */
  setInterval?: (fn: () => void, ms: number) => ReturnType<typeof globalThis.setInterval>;
  clearInterval?: (id: ReturnType<typeof globalThis.setInterval>) => void;
  /** Called when heartbeat gets 404 (server doesn't know this session). */
  onSessionNotFound?: () => void;
  /** Called to re-register immediately when server is reachable but session unknown. */
  onReregister?: () => Promise<boolean>;
}

export interface HeartbeatClient {
  register(body: RegisterBody): Promise<boolean>;
  startHeartbeats(getSnapshot: () => Promise<HeartbeatBody> | HeartbeatBody): void;
  stopHeartbeats(): void;
  unregister(sessionId: string): Promise<boolean>;
  /** Current consecutive failure count (exposed for testing). */
  readonly failures: number;
}

function computeInterval(failures: number): number {
  if (failures < FAILURE_THRESHOLD) return HEARTBEAT_INTERVAL_MS;
  const exponent = failures - FAILURE_THRESHOLD + 1;
  return Math.min(HEARTBEAT_INTERVAL_MS * Math.pow(2, exponent), MAX_BACKOFF_MS);
}

export function createHeartbeatClient(
  deps: HeartbeatClientDeps = {},
): HeartbeatClient {
  const fetchFn = deps.fetchFn ?? globalThis.fetch;
  const timerSet = deps.setInterval ?? globalThis.setInterval;
  const timerClear = deps.clearInterval ?? globalThis.clearInterval;
  const onSessionNotFound = deps.onSessionNotFound;
  const onReregister = deps.onReregister;

  let timer: ReturnType<typeof globalThis.setInterval> | null = null;
  let failures = 0;

  async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number }> {
    try {
      const response = await fetchFn(`${BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      return { ok: response.ok, status: response.status };
    } catch {
      return { ok: false, status: 0 };
    }
  }

  function scheduleNext(
    getSnapshot: () => Promise<HeartbeatBody> | HeartbeatBody,
  ): void {
    const interval = computeInterval(failures);

    timer = timerSet(async () => {
      // Clear immediately to reschedule with potentially different interval
      if (timer !== null) {
        timerClear(timer);
        timer = null;
      }

      try {
        const snapshot = await getSnapshot();
        const result = await post(
          `/api/sessions/${snapshot.sessionId}/heartbeat`,
          snapshot,
        );
        if (result.ok) {
          failures = 0;
        } else if (result.status === 404) {
          // Server is reachable but doesn't know this session (restarted).
          // Reset backoff: server is healthy, no reason to back off.
          failures = 0;
          onSessionNotFound?.();
          // Immediately re-register in this tick rather than waiting 5s.
          if (onReregister) {
            await onReregister();
          }
        } else {
          failures++;
        }
      } catch {
        // Connection failed: server unreachable, apply backoff.
        failures++;
      }

      scheduleNext(getSnapshot);
    }, interval);

    // Don't keep the Node.js process alive for heartbeats
    if (timer && typeof timer === "object" && "unref" in timer) {
      timer.unref();
    }
  }

  return {
    get failures() {
      return failures;
    },

    async register(body: RegisterBody): Promise<boolean> {
      const result = await post("/api/sessions/register", body);
      return result.ok;
    },

    startHeartbeats(
      getSnapshot: () => Promise<HeartbeatBody> | HeartbeatBody,
    ): void {
      // Stop any existing heartbeat loop
      if (timer !== null) {
        timerClear(timer);
        timer = null;
      }
      failures = 0;
      scheduleNext(getSnapshot);
    },

    stopHeartbeats(): void {
      if (timer !== null) {
        timerClear(timer);
        timer = null;
      }
    },

    async unregister(sessionId: string): Promise<boolean> {
      const result = await post(`/api/sessions/${sessionId}/unregister`, {});
      return result.ok;
    },
  };
}

export { FAILURE_THRESHOLD, MAX_BACKOFF_MS, computeInterval };
