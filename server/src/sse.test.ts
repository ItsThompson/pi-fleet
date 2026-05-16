import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer, type PiFleetServer } from "./server.js";
import http from "node:http";

// Silence the logger during tests
vi.mock("./utils/logger.js", () => ({
	log: vi.fn(),
}));

describe("Server Network Behavior", () => {
	let server: PiFleetServer;
	let baseUrl: string;

	afterEach(async () => {
		if (server) {
			await server.stop();
		}
	});

	async function startServer(): Promise<void> {
		server = createServer({ port: 0, host: "127.0.0.1" });
		await server.start();
		const address = server.app.server.address();
		if (typeof address === "object" && address) {
			baseUrl = `http://127.0.0.1:${address.port}`;
		}
	}

	function connectSSE(): Promise<{
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
				// Resolve immediately so the test can proceed
				resolve({ chunks, response, request });
			});
		});
	}

	it("sends connected event on SSE connection", async () => {
		await startServer();
		const { chunks, request } = await connectSSE();

		// Wait a tick for the connected event to arrive
		await new Promise((resolve) => setTimeout(resolve, 50));

		const combined = chunks.join("");
		expect(combined).toContain("event: connected");
		expect(combined).toContain('"serverTime"');

		request.destroy();
	});

	it("sets correct SSE headers", async () => {
		await startServer();
		const { response, request } = await connectSSE();

		expect(response.headers["content-type"]).toBe("text/event-stream");
		expect(response.headers["cache-control"]).toBe("no-cache");
		expect(response.headers["connection"]).toBe("keep-alive");

		request.destroy();
	});

	it("broadcasts session events to connected SSE clients", async () => {
		await startServer();
		const { chunks, request } = await connectSSE();

		// Wait for connected event
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Register a session via HTTP
		await fetch(`${baseUrl}/api/sessions/register`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "sess-sse-test",
				pid: 9999,
				cwd: "/test/sse",
				tmuxTarget: null,
				startTime: "2025-01-01T00:00:00.000Z",
			}),
		});

		// Wait for event delivery
		await new Promise((resolve) => setTimeout(resolve, 50));

		const combined = chunks.join("");
		expect(combined).toContain("event: session:added");
		expect(combined).toContain("sess-sse-test");

		request.destroy();
	});

	it("removes client from EventBus on disconnect", async () => {
		await startServer();
		const { request } = await connectSSE();

		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(server.eventBus.clientCount).toBe(1);

		request.destroy();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(server.eventBus.clientCount).toBe(0);
	});

	it("rejects with clear error when port is busy", async () => {
		await startServer();
		const address = server.app.server.address();
		const port = typeof address === "object" && address ? address.port : 0;

		// Try to start another server on the same port
		const server2 = createServer({ port, host: "127.0.0.1" });
		await expect(server2.start()).rejects.toThrow(/Failed to start server/);
	});
});
