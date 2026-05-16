import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer, type PiFleetServer } from "./server.js";
import type { SSEEvent } from "@pi-fleet/shared";

// Silence the logger during tests
vi.mock("./utils/logger.js", () => ({
	log: vi.fn(),
}));

describe("Server Routes", () => {
	let server: PiFleetServer;

	beforeEach(async () => {
		server = createServer({ port: 0, host: "127.0.0.1" });
		await server.app.ready();
	});

	afterEach(async () => {
		await server.stop();
	});

	describe("POST /api/sessions/register", () => {
		it("returns 201 and stores session with valid payload", async () => {
			const response = await server.app.inject({
				method: "POST",
				url: "/api/sessions/register",
				payload: {
					sessionId: "sess-1",
					pid: 1234,
					cwd: "/Users/test/project",
					tmuxTarget: "%0",
					startTime: "2025-01-01T00:00:00.000Z",
				},
			});

			expect(response.statusCode).toBe(201);
			expect(response.json()).toEqual({ ok: true });
			expect(server.registry.size).toBe(1);
		});

		it("returns 400 for invalid payload", async () => {
			const response = await server.app.inject({
				method: "POST",
				url: "/api/sessions/register",
				payload: { pid: "not-a-number" },
			});

			expect(response.statusCode).toBe(400);
			const body = response.json();
			expect(body.error).toBe("Validation failed");
			expect(body.issues).toBeDefined();
		});

		it("emits session:added via EventBus", async () => {
			const broadcastedEvents: SSEEvent[] = [];
			const originalBroadcast = server.eventBus.broadcast.bind(server.eventBus);
			server.eventBus.broadcast = (event: SSEEvent) => {
				broadcastedEvents.push(event);
				originalBroadcast(event);
			};

			await server.app.inject({
				method: "POST",
				url: "/api/sessions/register",
				payload: {
					sessionId: "sess-1",
					pid: 1234,
					cwd: "/home/user/proj",
					tmuxTarget: null,
					startTime: "2025-01-01T00:00:00.000Z",
				},
			});

			expect(broadcastedEvents).toHaveLength(1);
			expect(broadcastedEvents[0].type).toBe("session:added");
		});
	});

	describe("POST /api/sessions/:id/heartbeat", () => {
		beforeEach(async () => {
			await server.app.inject({
				method: "POST",
				url: "/api/sessions/register",
				payload: {
					sessionId: "sess-1",
					pid: 1234,
					cwd: "/Users/test/project",
					tmuxTarget: "%0",
					startTime: "2025-01-01T00:00:00.000Z",
				},
			});
		});

		it("returns 200 and updates session", async () => {
			const response = await server.app.inject({
				method: "POST",
				url: "/api/sessions/sess-1/heartbeat",
				payload: {
					sessionId: "sess-1",
					activity: "running_tool",
					lastEventTime: "2025-01-01T00:00:05.000Z",
					model: "Claude Sonnet 4",
					turnCount: 3,
				},
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({ ok: true });

			const session = server.registry.get("sess-1");
			expect(session!.activity).toBe("running_tool");
			expect(session!.model).toBe("Claude Sonnet 4");
			expect(session!.turnCount).toBe(3);
		});

		it("returns 404 for unknown session", async () => {
			const response = await server.app.inject({
				method: "POST",
				url: "/api/sessions/unknown/heartbeat",
				payload: {
					sessionId: "unknown",
					activity: "idle",
					lastEventTime: "2025-01-01T00:00:05.000Z",
				},
			});

			expect(response.statusCode).toBe(404);
		});

		it("returns 400 for invalid activity", async () => {
			const response = await server.app.inject({
				method: "POST",
				url: "/api/sessions/sess-1/heartbeat",
				payload: {
					sessionId: "sess-1",
					activity: "invalid_state",
					lastEventTime: "2025-01-01T00:00:05.000Z",
				},
			});

			expect(response.statusCode).toBe(400);
		});

		it("merges all optional heartbeat fields", async () => {
			const response = await server.app.inject({
				method: "POST",
				url: "/api/sessions/sess-1/heartbeat",
				payload: {
					sessionId: "sess-1",
					activity: "processing",
					lastEventTime: "2025-01-01T00:00:10.000Z",
					model: "Claude Opus 4",
					contextUsage: { tokens: 20000, contextWindow: 200000, percent: 10 },
					turnCount: 5,
					thinkingLevel: "high",
					lastToolName: "bash",
				},
			});

			expect(response.statusCode).toBe(200);
			const session = server.registry.get("sess-1")!;
			expect(session.model).toBe("Claude Opus 4");
			expect(session.contextUsage).toEqual({
				tokens: 20000,
				contextWindow: 200000,
				percent: 10,
			});
			expect(session.turnCount).toBe(5);
			expect(session.thinkingLevel).toBe("high");
			expect(session.lastToolName).toBe("bash");
		});

		it("emits session:updated via EventBus", async () => {
			const broadcastedEvents: SSEEvent[] = [];
			const originalBroadcast = server.eventBus.broadcast.bind(server.eventBus);
			server.eventBus.broadcast = (event: SSEEvent) => {
				broadcastedEvents.push(event);
				originalBroadcast(event);
			};

			await server.app.inject({
				method: "POST",
				url: "/api/sessions/sess-1/heartbeat",
				payload: {
					sessionId: "sess-1",
					activity: "processing",
					lastEventTime: "2025-01-01T00:00:05.000Z",
				},
			});

			const sessionEvent = broadcastedEvents.find(
				(e) => e.type === "session:updated",
			);
			expect(sessionEvent).toBeDefined();
			expect(sessionEvent!.type).toBe("session:updated");
		});
	});

	describe("POST /api/sessions/:id/unregister", () => {
		beforeEach(async () => {
			await server.app.inject({
				method: "POST",
				url: "/api/sessions/register",
				payload: {
					sessionId: "sess-1",
					pid: 1234,
					cwd: "/Users/test/project",
					tmuxTarget: "%0",
					startTime: "2025-01-01T00:00:00.000Z",
				},
			});
		});

		it("returns 200 and removes session", async () => {
			const response = await server.app.inject({
				method: "POST",
				url: "/api/sessions/sess-1/unregister",
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({ ok: true });
			expect(server.registry.size).toBe(0);
		});

		it("returns 404 when session already gone", async () => {
			await server.app.inject({
				method: "POST",
				url: "/api/sessions/sess-1/unregister",
			});

			const response = await server.app.inject({
				method: "POST",
				url: "/api/sessions/sess-1/unregister",
			});

			expect(response.statusCode).toBe(404);
		});

		it("emits session:removed via EventBus", async () => {
			const broadcastedEvents: SSEEvent[] = [];
			const originalBroadcast = server.eventBus.broadcast.bind(server.eventBus);
			server.eventBus.broadcast = (event: SSEEvent) => {
				broadcastedEvents.push(event);
				originalBroadcast(event);
			};

			await server.app.inject({
				method: "POST",
				url: "/api/sessions/sess-1/unregister",
			});

			// One broadcast: session:removed (via registry event listener)
			const removedEvents = broadcastedEvents.filter(
				(event) => event.type === "session:removed",
			);
			expect(removedEvents).toHaveLength(1);
			expect(removedEvents[0].type).toBe("session:removed");
			if (removedEvents[0].type === "session:removed") {
				expect(removedEvents[0].data.sessionId).toBe("sess-1");
			}
		});
	});

	describe("GET /api/sessions", () => {
		it("returns empty list when no sessions", async () => {
			const response = await server.app.inject({
				method: "GET",
				url: "/api/sessions",
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({ sessions: [] });
		});

		it("returns all registered sessions", async () => {
			await server.app.inject({
				method: "POST",
				url: "/api/sessions/register",
				payload: {
					sessionId: "sess-1",
					pid: 1234,
					cwd: "/path/a",
					tmuxTarget: null,
					startTime: "2025-01-01T00:00:00.000Z",
				},
			});
			await server.app.inject({
				method: "POST",
				url: "/api/sessions/register",
				payload: {
					sessionId: "sess-2",
					pid: 5678,
					cwd: "/path/b",
					tmuxTarget: "%1",
					startTime: "2025-01-01T00:00:01.000Z",
				},
			});

			const response = await server.app.inject({
				method: "GET",
				url: "/api/sessions",
			});

			const body = response.json();
			expect(body.sessions).toHaveLength(2);
			const ids = body.sessions.map(
				(session: { sessionId: string }) => session.sessionId,
			);
			expect(ids).toContain("sess-1");
			expect(ids).toContain("sess-2");
		});
	});

	describe("GET /api/health", () => {
		it("returns health status", async () => {
			const response = await server.app.inject({
				method: "GET",
				url: "/api/health",
			});

			expect(response.statusCode).toBe(200);
			const body = response.json();
			expect(body.status).toBe("ok");
			expect(body.uptime).toBeTypeOf("number");
			expect(body.sessions).toBe(0);
			expect(body.pods).toBe(0);
			expect(body.version).toBe("0.1.0");
		});

		it("reflects session count", async () => {
			await server.app.inject({
				method: "POST",
				url: "/api/sessions/register",
				payload: {
					sessionId: "sess-1",
					pid: 1234,
					cwd: "/path",
					tmuxTarget: null,
					startTime: "2025-01-01T00:00:00.000Z",
				},
			});

			const response = await server.app.inject({
				method: "GET",
				url: "/api/health",
			});

			expect(response.json().sessions).toBe(1);
		});
	});
});
