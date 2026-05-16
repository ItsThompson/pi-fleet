import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestServer, type TestServer } from "./test-server-builder.js";
import http from "node:http";

vi.mock("@pi-fleet/shared", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@pi-fleet/shared")>();
  return { ...actual, SSE_KEEPALIVE_MS: 50 };
});

/** Must match the mocked SSE_KEEPALIVE_MS above */
const TEST_KEEPALIVE_MS = 50;

vi.mock("../utils/logger.js", () => ({
  log: vi.fn(),
}));

describe("events routes (SSE)", () => {
  let testServer: TestServer;

  beforeEach(async () => {
    testServer = await createTestServer();
  });

  afterEach(async () => {
    await testServer.cleanup();
  });

  describe("GET /api/events", () => {
    it("returns 200 with text/event-stream content type", async () => {
      const address = await startListening();
      const { response, request } = await connectSSE(address);

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("text/event-stream");
      expect(response.headers["cache-control"]).toBe("no-cache");
      expect(response.headers["connection"]).toBe("keep-alive");

      request.destroy();
    });

    it("sends connected event immediately on connection", async () => {
      const address = await startListening();
      const { chunks, request } = await connectSSE(address);

      await waitForChunks(chunks, 1);

      const combined = chunks.join("");
      expect(combined).toContain("event: connected");
      expect(combined).toContain('"serverTime"');

      request.destroy();
    });

    it("formats events as SSE wire protocol (event: type\\ndata: json\\n\\n)", async () => {
      const address = await startListening();
      const { chunks, request } = await connectSSE(address);

      await waitForChunks(chunks, 1);

      const combined = chunks.join("");
      // SSE wire format: "event: <type>\ndata: <json>\n\n"
      const ssePattern = /event: connected\ndata: \{.*"serverTime".*\}\n\n/;
      expect(combined).toMatch(ssePattern);

      request.destroy();
    });

    it("broadcasts session events to connected clients", async () => {
      const address = await startListening();
      const { chunks, request } = await connectSSE(address);

      // Wait for connected event
      await waitForChunks(chunks, 1);

      // Register a session to trigger a session:added broadcast
      await fetch(`${address}/api/sessions/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "sess-event-test",
          pid: 5000,
          cwd: "/Users/test/proj",
          tmuxTarget: null,
          startTime: "2025-01-01T00:00:00.000Z",
        }),
      });

      await waitForChunks(chunks, 2);

      const combined = chunks.join("");
      expect(combined).toContain("event: session:added");
      expect(combined).toContain("sess-event-test");

      request.destroy();
    });

    it("broadcasts pod events to connected clients", async () => {
      const address = await startListening();

      // Register parent and child before SSE connection
      await fetch(`${address}/api/sessions/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "parent-pod",
          pid: 1000,
          cwd: "/Users/test/main",
          tmuxTarget: null,
          startTime: "2025-01-01T00:00:00.000Z",
        }),
      });
      await fetch(`${address}/api/sessions/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "child-pod",
          pid: 2000,
          cwd: "/Users/test/sub",
          tmuxTarget: null,
          startTime: "2025-01-01T00:00:00.000Z",
          subagentId: "sub-agent-1",
        }),
      });

      // Now connect SSE
      const { chunks, request } = await connectSSE(address);
      await waitForChunks(chunks, 1);

      // Report ownership: triggers pod:formed event
      await fetch(`${address}/api/pods/ownership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentSessionId: "parent-pod",
          subagentIds: ["sub-agent-1"],
        }),
      });

      await waitForChunks(chunks, 2);

      const combined = chunks.join("");
      expect(combined).toContain("event: pod:formed");
      expect(combined).toContain("parent-pod");

      request.destroy();
    });

    it("cleans up client on disconnect", async () => {
      const address = await startListening();
      const { request } = await connectSSE(address);

      await delay(30);
      expect(testServer.eventBus.clientCount).toBe(1);

      request.destroy();
      await delay(50);
      expect(testServer.eventBus.clientCount).toBe(0);
    });

    it("sends keep-alive heartbeat at configured interval", async () => {
      const address = await startListening();
      const { chunks, request } = await connectSSE(address);

      // Wait for connected event first
      await waitForChunks(chunks, 1);

      // Wait longer than the mocked keepalive interval (50ms)
      // to allow the heartbeat to fire
      await delay(TEST_KEEPALIVE_MS + 50);

      const combined = chunks.join("");
      expect(combined).toContain("event: connected");
      expect(combined).toContain("event: heartbeat");
      // Verify heartbeat data format
      expect(combined).toContain("data: {}");

      request.destroy();
    });
  });

  // --- Helpers ---

  async function startListening(): Promise<string> {
    await testServer.server.app.listen({ port: 0, host: "127.0.0.1" });
    const addr = testServer.server.app.server.address();
    if (typeof addr === "object" && addr) {
      return `http://127.0.0.1:${addr.port}`;
    }
    throw new Error("Could not determine server address");
  }

  function connectSSE(baseUrl: string): Promise<{
    chunks: string[];
    response: http.IncomingMessage;
    request: http.ClientRequest;
  }> {
    return new Promise((resolve) => {
      const chunks: string[] = [];
      const request = http.get(`${baseUrl}/api/events`, (response) => {
        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk.toString());
        });
        resolve({ chunks, response, request });
      });
    });
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForChunks(
    chunks: string[],
    minCount: number,
    timeoutMs = 500,
  ): Promise<void> {
    const start = Date.now();
    while (chunks.length < minCount && Date.now() - start < timeoutMs) {
      await delay(10);
    }
  }
});
