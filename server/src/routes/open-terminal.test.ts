import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer } from "../server.js";
import type { PiFleetServer } from "../server.js";

describe("POST /api/open-terminal", () => {
	let server: PiFleetServer;

	beforeEach(async () => {
		server = createServer({ port: 0 });
		await server.app.ready();
	});

	afterEach(async () => {
		await server.stop();
	});

	it("returns tmuxTarget for a valid session with target", async () => {
		server.registry.register({
			sessionId: "sess-1",
			pid: 1234,
			cwd: "/Users/test/project",
			tmuxTarget: "%0",
			startTime: "2025-01-01T00:00:00.000Z",
		});

		const response = await server.app.inject({
			method: "POST",
			url: "/api/open-terminal",
			payload: { sessionId: "sess-1" },
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ tmuxTarget: "%0" });
	});

	it("returns 404 for unknown session", async () => {
		const response = await server.app.inject({
			method: "POST",
			url: "/api/open-terminal",
			payload: { sessionId: "unknown" },
		});

		expect(response.statusCode).toBe(404);
		expect(response.json()).toEqual({ error: "Session not found" });
	});

	it("returns 400 when session has no tmux target", async () => {
		server.registry.register({
			sessionId: "sess-no-tmux",
			pid: 5678,
			cwd: "/Users/test/other",
			tmuxTarget: null,
			startTime: "2025-01-01T00:00:00.000Z",
		});

		const response = await server.app.inject({
			method: "POST",
			url: "/api/open-terminal",
			payload: { sessionId: "sess-no-tmux" },
		});

		expect(response.statusCode).toBe(400);
		expect(response.json()).toEqual({ error: "Session has no tmux target" });
	});

	it("returns 400 for invalid request body", async () => {
		const response = await server.app.inject({
			method: "POST",
			url: "/api/open-terminal",
			payload: {},
		});

		expect(response.statusCode).toBe(400);
		expect(response.json().error).toBe("Validation failed");
	});

	it("returns pane ID in tmuxTarget", async () => {
		server.registry.register({
			sessionId: "sess-2",
			pid: 9999,
			cwd: "/Users/test/dev",
			tmuxTarget: "%12",
			startTime: "2025-01-01T00:00:00.000Z",
		});

		const response = await server.app.inject({
			method: "POST",
			url: "/api/open-terminal",
			payload: { sessionId: "sess-2" },
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ tmuxTarget: "%12" });
	});
});
