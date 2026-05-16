import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createTestServer,
  type TestServer,
} from "../__tests__/test-server-builder.js";
import type { SSEEvent } from "@pi-fleet/shared";

vi.mock("../utils/logger.js", () => ({
  log: vi.fn(),
}));

describe("sessions routes", () => {
  let testServer: TestServer;

  beforeEach(async () => {
    testServer = await createTestServer();
  });

  afterEach(async () => {
    await testServer.cleanup();
  });

  describe("POST /api/sessions/register", () => {
    it("registers a session and returns 201", async () => {
      const response = await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/register",
        payload: {
          sessionId: "sess-1",
          pid: 1234,
          cwd: "/Users/test/project",
          tmuxTarget: "main:1.0",
          startTime: "2025-01-01T00:00:00.000Z",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ ok: true });
      expect(testServer.sessionRegistry.size).toBe(1);
    });

    it("validates required fields (sessionId, pid, cwd, tmuxTarget, startTime)", async () => {
      const response = await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/register",
        payload: {
          sessionId: "sess-1",
          // missing: pid, cwd, tmuxTarget, startTime
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBe("Validation failed");
      expect(body.issues).toBeDefined();
      expect(body.issues.length).toBeGreaterThan(0);
    });

    it("rejects invalid body with 400 and validation issues", async () => {
      const response = await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/register",
        payload: {
          sessionId: "",
          pid: "not-a-number",
          cwd: "",
          tmuxTarget: 123,
          startTime: "",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBe("Validation failed");
      expect(body.issues).toBeDefined();
    });

    it("accepts optional fields (agentName, subagentId, model, contextUsage)", async () => {
      const response = await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/register",
        payload: {
          sessionId: "sess-opts",
          pid: 5678,
          cwd: "/Users/test/proj",
          tmuxTarget: "main:1.0",
          startTime: "2025-01-01T00:00:00.000Z",
          agentName: "TestAgent",
          subagentId: "sub-1",
          model: "Claude Sonnet 4",
          contextUsage: { tokens: 5000, contextWindow: 200000, percent: 2.5 },
        },
      });

      expect(response.statusCode).toBe(201);

      const session = testServer.sessionRegistry.get("sess-opts");
      expect(session).toBeDefined();
      expect(session!.agentName).toBe("TestAgent");
      expect(session!.subagentId).toBe("sub-1");
      expect(session!.model).toBe("Claude Sonnet 4");
      expect(session!.contextUsage).toEqual({
        tokens: 5000,
        contextWindow: 200000,
        percent: 2.5,
      });
    });

    it("accepts null tmuxTarget", async () => {
      const response = await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/register",
        payload: {
          sessionId: "sess-null-tmux",
          pid: 1000,
          cwd: "/Users/test/project",
          tmuxTarget: null,
          startTime: "2025-01-01T00:00:00.000Z",
        },
      });

      expect(response.statusCode).toBe(201);

      const session = testServer.sessionRegistry.get("sess-null-tmux");
      expect(session).toBeDefined();
      expect(session!.tmuxTarget).toBeNull();
    });

    it("handles duplicate sessionId (second register overwrites)", async () => {
      const payload = {
        sessionId: "sess-dup",
        pid: 1234,
        cwd: "/Users/test/first",
        tmuxTarget: "main:1.0",
        startTime: "2025-01-01T00:00:00.000Z",
      };

      await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/register",
        payload,
      });

      const response = await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/register",
        payload: { ...payload, cwd: "/Users/test/second" },
      });

      expect(response.statusCode).toBe(201);
      expect(testServer.sessionRegistry.size).toBe(1);

      const session = testServer.sessionRegistry.get("sess-dup");
      expect(session!.cwd).toBe("/Users/test/second");
    });
  });

  describe("POST /api/sessions/:id/heartbeat", () => {
    beforeEach(async () => {
      await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/register",
        payload: {
          sessionId: "sess-hb",
          pid: 1234,
          cwd: "/Users/test/project",
          tmuxTarget: "main:1.0",
          startTime: "2025-01-01T00:00:00.000Z",
        },
      });
    });

    it("updates session activity and returns 200", async () => {
      const response = await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/sess-hb/heartbeat",
        payload: {
          sessionId: "sess-hb",
          activity: "running_tool",
          lastEventTime: "2025-01-01T00:01:00.000Z",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });

      const session = testServer.sessionRegistry.get("sess-hb");
      expect(session!.activity).toBe("running_tool");
    });

    it("returns 404 for unregistered session", async () => {
      const response = await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/unknown-session/heartbeat",
        payload: {
          sessionId: "unknown-session",
          activity: "idle",
          lastEventTime: "2025-01-01T00:01:00.000Z",
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe("Session not found");
    });

    it("rejects invalid body with 400", async () => {
      const response = await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/sess-hb/heartbeat",
        payload: {
          sessionId: "sess-hb",
          activity: "invalid_activity",
          lastEventTime: "",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBe("Validation failed");
      expect(body.issues).toBeDefined();
    });

    it("accepts all optional heartbeat fields", async () => {
      const response = await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/sess-hb/heartbeat",
        payload: {
          sessionId: "sess-hb",
          activity: "processing",
          lastEventTime: "2025-01-01T00:01:00.000Z",
          tmuxTarget: "main:2.0",
          agentName: "UpdatedAgent",
          model: "Claude Opus 4",
          contextUsage: { tokens: 30000, contextWindow: 200000, percent: 15 },
          turnCount: 7,
          thinkingLevel: "high",
          lastToolName: "read",
        },
      });

      expect(response.statusCode).toBe(200);

      const session = testServer.sessionRegistry.get("sess-hb")!;
      expect(session.tmuxTarget).toBe("main:2.0");
      expect(session.agentName).toBe("UpdatedAgent");
      expect(session.model).toBe("Claude Opus 4");
      expect(session.contextUsage).toEqual({
        tokens: 30000,
        contextWindow: 200000,
        percent: 15,
      });
      expect(session.turnCount).toBe(7);
      expect(session.thinkingLevel).toBe("high");
      expect(session.lastToolName).toBe("read");
    });

    it("updates tmuxTarget from null to a value", async () => {
      // Register with null tmuxTarget
      await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/register",
        payload: {
          sessionId: "sess-null-update",
          pid: 2000,
          cwd: "/Users/test/proj",
          tmuxTarget: null,
          startTime: "2025-01-01T00:00:00.000Z",
        },
      });

      const response = await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/sess-null-update/heartbeat",
        payload: {
          sessionId: "sess-null-update",
          activity: "idle",
          lastEventTime: "2025-01-01T00:01:00.000Z",
          tmuxTarget: "main:3.0",
        },
      });

      expect(response.statusCode).toBe(200);
      const session = testServer.sessionRegistry.get("sess-null-update")!;
      expect(session.tmuxTarget).toBe("main:3.0");
    });
  });

  describe("POST /api/sessions/:id/unregister", () => {
    beforeEach(async () => {
      await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/register",
        payload: {
          sessionId: "sess-unreg",
          pid: 1234,
          cwd: "/Users/test/project",
          tmuxTarget: "main:1.0",
          startTime: "2025-01-01T00:00:00.000Z",
        },
      });
    });

    it("removes a registered session and returns 200", async () => {
      const response = await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/sess-unreg/unregister",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      expect(testServer.sessionRegistry.get("sess-unreg")).toBeUndefined();
    });

    it("returns 404 for already-unregistered session", async () => {
      // Unregister once
      await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/sess-unreg/unregister",
      });

      // Try again
      const response = await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/sess-unreg/unregister",
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe("Session not found");
    });

    it("emits session:removed event via event bus", async () => {
      const receivedEvents: SSEEvent[] = [];
      testServer.eventBus.addClient({
        id: "test-spy",
        send: (event) => receivedEvents.push(event),
        close: () => {},
      });

      await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/sess-unreg/unregister",
      });

      const removedEvents = receivedEvents.filter(
        (event) => event.type === "session:removed",
      );
      expect(removedEvents).toHaveLength(1);
      expect(removedEvents[0].type).toBe("session:removed");
      expect(removedEvents[0].data).toEqual({ sessionId: "sess-unreg" });
    });
  });

  describe("GET /api/sessions", () => {
    it("returns empty array when no sessions registered", async () => {
      const response = await testServer.server.app.inject({
        method: "GET",
        url: "/api/sessions",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ sessions: [] });
    });

    it("returns all registered sessions", async () => {
      await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/register",
        payload: {
          sessionId: "sess-a",
          pid: 1000,
          cwd: "/path/a",
          tmuxTarget: null,
          startTime: "2025-01-01T00:00:00.000Z",
        },
      });
      await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/register",
        payload: {
          sessionId: "sess-b",
          pid: 2000,
          cwd: "/path/b",
          tmuxTarget: "main:2.0",
          startTime: "2025-01-01T00:00:01.000Z",
        },
      });

      const response = await testServer.server.app.inject({
        method: "GET",
        url: "/api/sessions",
      });

      const body = response.json();
      expect(body.sessions).toHaveLength(2);
      const ids = body.sessions.map(
        (session: { sessionId: string }) => session.sessionId,
      );
      expect(ids).toContain("sess-a");
      expect(ids).toContain("sess-b");
    });

    it("does not include unregistered sessions", async () => {
      await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/register",
        payload: {
          sessionId: "sess-stay",
          pid: 1000,
          cwd: "/path/stay",
          tmuxTarget: null,
          startTime: "2025-01-01T00:00:00.000Z",
        },
      });
      await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/register",
        payload: {
          sessionId: "sess-leave",
          pid: 2000,
          cwd: "/path/leave",
          tmuxTarget: null,
          startTime: "2025-01-01T00:00:01.000Z",
        },
      });

      // Unregister one
      await testServer.server.app.inject({
        method: "POST",
        url: "/api/sessions/sess-leave/unregister",
      });

      const response = await testServer.server.app.inject({
        method: "GET",
        url: "/api/sessions",
      });

      const body = response.json();
      expect(body.sessions).toHaveLength(1);
      expect(body.sessions[0].sessionId).toBe("sess-stay");
    });
  });
});
