import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HEARTBEAT_INTERVAL_MS } from "@pi-fleet/shared";
import {
  createHeartbeatClient,
  computeInterval,
  FAILURE_THRESHOLD,
  MAX_BACKOFF_MS,
  type HeartbeatClient,
} from "./heartbeat-client.js";

describe("computeInterval", () => {
  it("returns HEARTBEAT_INTERVAL_MS below threshold", () => {
    expect(computeInterval(0)).toBe(HEARTBEAT_INTERVAL_MS);
    expect(computeInterval(1)).toBe(HEARTBEAT_INTERVAL_MS);
    expect(computeInterval(2)).toBe(HEARTBEAT_INTERVAL_MS);
  });

  it("doubles after reaching threshold", () => {
    expect(computeInterval(3)).toBe(HEARTBEAT_INTERVAL_MS * 2); // 10000
    expect(computeInterval(4)).toBe(HEARTBEAT_INTERVAL_MS * 4); // 20000
  });

  it("caps at MAX_BACKOFF_MS", () => {
    expect(computeInterval(5)).toBe(MAX_BACKOFF_MS); // 5000 * 8 = 40000 → capped
    expect(computeInterval(10)).toBe(MAX_BACKOFF_MS);
  });
});

describe("HeartbeatClient", () => {
  let client: HeartbeatClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  function stubFetchOk() {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
  }

  function stubFetchError() {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
  }

  function stubFetchReject() {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch = vi.fn();
    stubFetchOk();
    client = createHeartbeatClient({ fetchFn: mockFetch as typeof fetch });
  });

  afterEach(() => {
    client.stopHeartbeats();
    vi.useRealTimers();
  });

  describe("register", () => {
    it("posts to /api/sessions/register", async () => {
      await client.register({
        sessionId: "s1",
        pid: 123,
        cwd: "/project",
        tmuxTarget: "main:1.0",
        startTime: "2026-01-01T00:00:00.000Z",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:8314/api/sessions/register");
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body)).toMatchObject({ sessionId: "s1", pid: 123 });
    });

    it("returns true on success", async () => {
      const result = await client.register({
        sessionId: "s1",
        pid: 123,
        cwd: "/",
        tmuxTarget: null,
        startTime: "2026-01-01T00:00:00.000Z",
      });
      expect(result).toBe(true);
    });

    it("returns false on server error", async () => {
      stubFetchError();
      const result = await client.register({
        sessionId: "s1",
        pid: 123,
        cwd: "/",
        tmuxTarget: null,
        startTime: "2026-01-01T00:00:00.000Z",
      });
      expect(result).toBe(false);
    });

    it("returns false on network error", async () => {
      stubFetchReject();
      const result = await client.register({
        sessionId: "s1",
        pid: 123,
        cwd: "/",
        tmuxTarget: null,
        startTime: "2026-01-01T00:00:00.000Z",
      });
      expect(result).toBe(false);
    });
  });

  describe("heartbeats", () => {
    const snapshot = () => ({
      sessionId: "s1",
      activity: "idle" as const,
      lastEventTime: "2026-01-01T00:00:00.000Z",
    });

    it("fires first heartbeat after HEARTBEAT_INTERVAL_MS", async () => {
      const getSnapshot = vi.fn().mockReturnValue(snapshot());
      client.startHeartbeats(getSnapshot);

      expect(getSnapshot).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      expect(getSnapshot).toHaveBeenCalledTimes(1);
    });

    it("posts to /api/sessions/:id/heartbeat", async () => {
      client.startHeartbeats(() => snapshot());
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:8314/api/sessions/s1/heartbeat");
      expect(opts.method).toBe("POST");
    });

    it("continues sending heartbeats on success", async () => {
      const getSnapshot = vi.fn().mockReturnValue(snapshot());
      client.startHeartbeats(getSnapshot);

      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      expect(getSnapshot).toHaveBeenCalledTimes(3);
    });

    it("backs off after FAILURE_THRESHOLD consecutive failures", async () => {
      stubFetchError();
      const getSnapshot = vi.fn().mockReturnValue(snapshot());
      client.startHeartbeats(getSnapshot);

      // 3 failures at normal cadence
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      expect(getSnapshot).toHaveBeenCalledTimes(3);
      expect(client.failures).toBe(3);

      // Next heartbeat should be at doubled interval (10s instead of 5s)
      getSnapshot.mockClear();
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      expect(getSnapshot).not.toHaveBeenCalled(); // Not yet

      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS); // Now at 10s total
      expect(getSnapshot).toHaveBeenCalledTimes(1);
    });

    it("resets to normal interval on success after backoff", async () => {
      stubFetchError();
      const getSnapshot = vi.fn().mockReturnValue(snapshot());
      client.startHeartbeats(getSnapshot);

      // 3 failures
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);
      expect(client.failures).toBe(3);

      // Now succeed
      stubFetchOk();
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 2); // 10s backoff
      expect(client.failures).toBe(0);

      // Next should be at normal interval
      getSnapshot.mockClear();
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      expect(getSnapshot).toHaveBeenCalledTimes(1);
    });

    it("caps backoff at MAX_BACKOFF_MS", async () => {
      stubFetchError();
      const getSnapshot = vi.fn().mockReturnValue(snapshot());
      client.startHeartbeats(getSnapshot);

      // Generate many failures to exceed cap
      for (let i = 0; i < 5; i++) {
        const interval = computeInterval(i);
        await vi.advanceTimersByTimeAsync(interval);
      }

      // At 5 failures, interval should be capped at 30s
      getSnapshot.mockClear();
      await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS - 1);
      expect(getSnapshot).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(getSnapshot).toHaveBeenCalledTimes(1);
    });

    it("handles network errors as failures", async () => {
      stubFetchReject();
      const getSnapshot = vi.fn().mockReturnValue(snapshot());
      client.startHeartbeats(getSnapshot);

      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      expect(client.failures).toBe(1);
    });
  });

  describe("stopHeartbeats", () => {
    it("prevents further heartbeats", async () => {
      const getSnapshot = vi.fn().mockReturnValue({
        sessionId: "s1",
        activity: "idle",
        lastEventTime: "2026-01-01T00:00:00.000Z",
      });

      client.startHeartbeats(getSnapshot);
      client.stopHeartbeats();

      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 5);
      expect(getSnapshot).not.toHaveBeenCalled();
    });
  });

  describe("unregister", () => {
    it("posts to /api/sessions/:id/unregister", async () => {
      await client.unregister("s1");

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:8314/api/sessions/s1/unregister");
      expect(opts.method).toBe("POST");
    });

    it("returns true on success", async () => {
      const result = await client.unregister("s1");
      expect(result).toBe(true);
    });

    it("returns false on 404 (idempotent, no crash)", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      const result = await client.unregister("s1");
      expect(result).toBe(false);
    });

    it("returns false on network error (no crash)", async () => {
      stubFetchReject();
      const result = await client.unregister("s1");
      expect(result).toBe(false);
    });
  });

  describe("404 recovery (server restart)", () => {
    const snapshot = () => ({
      sessionId: "s1",
      activity: "idle" as const,
      lastEventTime: "2026-01-01T00:00:00.000Z",
    });

    it("resets failures to 0 on 404 (server is reachable)", async () => {
      // Accumulate failures from connection errors
      stubFetchReject();
      const getSnapshot = vi.fn().mockReturnValue(snapshot());
      client.startHeartbeats(getSnapshot);

      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      expect(client.failures).toBe(3);

      // Server comes back but doesn't know us (404)
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      await vi.advanceTimersByTimeAsync(computeInterval(3)); // 10s backoff
      expect(client.failures).toBe(0);
    });

    it("calls onSessionNotFound on 404", async () => {
      const onSessionNotFound = vi.fn();
      client.stopHeartbeats();
      client = createHeartbeatClient({
        fetchFn: mockFetch as typeof fetch,
        onSessionNotFound,
      });

      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      const getSnapshot = vi.fn().mockReturnValue(snapshot());
      client.startHeartbeats(getSnapshot);

      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      expect(onSessionNotFound).toHaveBeenCalledTimes(1);
    });

    it("calls onReregister immediately on 404", async () => {
      const onReregister = vi.fn().mockResolvedValue(true);
      client.stopHeartbeats();
      client = createHeartbeatClient({
        fetchFn: mockFetch as typeof fetch,
        onReregister,
      });

      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      const getSnapshot = vi.fn().mockReturnValue(snapshot());
      client.startHeartbeats(getSnapshot);

      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      expect(onReregister).toHaveBeenCalledTimes(1);
    });

    it("resumes normal 5s interval after 404 recovery", async () => {
      // Accumulate backoff from connection failures
      stubFetchReject();
      const getSnapshot = vi.fn().mockReturnValue(snapshot());
      client.startHeartbeats(getSnapshot);

      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);
      expect(client.failures).toBe(3);

      // Server returns 404: resets failures
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      await vi.advanceTimersByTimeAsync(computeInterval(3));
      expect(client.failures).toBe(0);

      // Next tick should fire at normal interval (5s), not backoff
      stubFetchOk();
      getSnapshot.mockClear();
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      expect(getSnapshot).toHaveBeenCalledTimes(1);
    });

    it("does not apply backoff for 404 (only for connection errors)", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      const getSnapshot = vi.fn().mockReturnValue(snapshot());
      client.startHeartbeats(getSnapshot);

      // Multiple 404s should NOT cause backoff
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      expect(client.failures).toBe(0);
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      expect(client.failures).toBe(0);
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      expect(client.failures).toBe(0);

      // Still on 5s cadence (no backoff)
      getSnapshot.mockClear();
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      expect(getSnapshot).toHaveBeenCalledTimes(1);
    });
  });
});
