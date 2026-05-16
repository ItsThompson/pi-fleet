import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestServer, type TestServer } from "./test-server-builder.js";

vi.mock("../utils/logger.js", () => ({
	log: vi.fn(),
}));

describe("pods routes", () => {
	let testServer: TestServer;

	beforeEach(async () => {
		testServer = await createTestServer();
	});

	afterEach(async () => {
		await testServer.cleanup();
	});

	/** Helper to register a session via the HTTP route */
	async function registerSession(overrides: Record<string, unknown> = {}) {
		const defaults = {
			sessionId: "sess-1",
			pid: 1234,
			cwd: "/Users/test/project",
			tmuxTarget: "%0",
			startTime: "2025-01-01T00:00:00.000Z",
		};
		return testServer.server.app.inject({
			method: "POST",
			url: "/api/sessions/register",
			payload: { ...defaults, ...overrides },
		});
	}

	describe("GET /api/pods", () => {
		it("returns empty array when no sessions exist", async () => {
			const response = await testServer.server.app.inject({
				method: "GET",
				url: "/api/pods",
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({ pods: [] });
		});

		it("returns single-member pods for standalone sessions", async () => {
			await registerSession({
				sessionId: "standalone-1",
				agentName: "Agent Alpha",
			});
			await registerSession({
				sessionId: "standalone-2",
				pid: 2000,
				cwd: "/Users/test/other",
				agentName: "Agent Beta",
			});

			const response = await testServer.server.app.inject({
				method: "GET",
				url: "/api/pods",
			});

			const body = response.json();
			expect(body.pods).toHaveLength(2);

			const pod1 = body.pods.find(
				(pod: { leadSessionId: string }) =>
					pod.leadSessionId === "standalone-1",
			);
			expect(pod1).toBeDefined();
			expect(pod1.memberSessionIds).toEqual(["standalone-1"]);
			expect(pod1.displayName).toBe("Agent Alpha");

			const pod2 = body.pods.find(
				(pod: { leadSessionId: string }) =>
					pod.leadSessionId === "standalone-2",
			);
			expect(pod2).toBeDefined();
			expect(pod2.memberSessionIds).toEqual(["standalone-2"]);
			expect(pod2.displayName).toBe("Agent Beta");
		});

		it("returns multi-member pod after ownership report", async () => {
			// Register parent
			await registerSession({
				sessionId: "parent-1",
				pid: 1000,
				agentName: "Orchestrator",
			});

			// Register child with subagentId
			await registerSession({
				sessionId: "child-1",
				pid: 2000,
				cwd: "/Users/test/sub",
				subagentId: "agent-a",
			});

			// Report ownership
			await testServer.server.app.inject({
				method: "POST",
				url: "/api/pods/ownership",
				payload: {
					parentSessionId: "parent-1",
					subagentIds: ["agent-a"],
				},
			});

			const response = await testServer.server.app.inject({
				method: "GET",
				url: "/api/pods",
			});

			const body = response.json();
			// Parent and child are now in one pod, no separate pod for child
			const parentPod = body.pods.find(
				(pod: { leadSessionId: string }) => pod.leadSessionId === "parent-1",
			);
			expect(parentPod).toBeDefined();
			expect(parentPod.memberSessionIds).toContain("parent-1");
			expect(parentPod.memberSessionIds).toContain("child-1");
			expect(parentPod.displayName).toBe("Orchestrator");
		});
	});

	describe("POST /api/pods/ownership", () => {
		it("accepts valid ownership report and returns 200", async () => {
			await registerSession({ sessionId: "parent-1", pid: 1000 });
			await registerSession({
				sessionId: "child-1",
				pid: 2000,
				subagentId: "sub-a",
			});

			const response = await testServer.server.app.inject({
				method: "POST",
				url: "/api/pods/ownership",
				payload: {
					parentSessionId: "parent-1",
					subagentIds: ["sub-a"],
				},
			});

			expect(response.statusCode).toBe(200);
			expect(response.json().ok).toBe(true);
		});

		it("reports matched and unmatched subagent IDs", async () => {
			await registerSession({ sessionId: "parent-1", pid: 1000 });
			await registerSession({
				sessionId: "child-1",
				pid: 2000,
				subagentId: "sub-a",
			});

			const response = await testServer.server.app.inject({
				method: "POST",
				url: "/api/pods/ownership",
				payload: {
					parentSessionId: "parent-1",
					subagentIds: ["sub-a", "sub-unknown"],
				},
			});

			const body = response.json();
			expect(body.matchedIds).toEqual(["sub-a"]);
			expect(body.unmatchedIds).toEqual(["sub-unknown"]);
		});

		it("rejects invalid body (missing parentSessionId)", async () => {
			const response = await testServer.server.app.inject({
				method: "POST",
				url: "/api/pods/ownership",
				payload: {
					subagentIds: ["sub-a"],
				},
			});

			expect(response.statusCode).toBe(400);
			const body = response.json();
			expect(body.error).toBe("Validation failed");
			expect(body.issues).toBeDefined();
			expect(body.issues.length).toBeGreaterThan(0);
		});

		it("handles ownership with all unmatched IDs", async () => {
			await registerSession({ sessionId: "parent-1", pid: 1000 });

			const response = await testServer.server.app.inject({
				method: "POST",
				url: "/api/pods/ownership",
				payload: {
					parentSessionId: "parent-1",
					subagentIds: ["not-registered-1", "not-registered-2"],
				},
			});

			expect(response.statusCode).toBe(200);
			const body = response.json();
			expect(body.matchedIds).toEqual([]);
			expect(body.unmatchedIds).toEqual([
				"not-registered-1",
				"not-registered-2",
			]);
		});

		it("handles ownership with empty subagentIds array", async () => {
			await registerSession({ sessionId: "parent-1", pid: 1000 });

			const response = await testServer.server.app.inject({
				method: "POST",
				url: "/api/pods/ownership",
				payload: {
					parentSessionId: "parent-1",
					subagentIds: [],
				},
			});

			expect(response.statusCode).toBe(200);
			const body = response.json();
			expect(body.ok).toBe(true);
			expect(body.matchedIds).toEqual([]);
			expect(body.unmatchedIds).toEqual([]);
		});

		it("updates pod structure on subsequent ownership report", async () => {
			// Register parent and two children
			await registerSession({ sessionId: "parent-1", pid: 1000 });
			await registerSession({
				sessionId: "child-1",
				pid: 2000,
				subagentId: "sub-a",
			});
			await registerSession({
				sessionId: "child-2",
				pid: 3000,
				subagentId: "sub-b",
			});

			// First ownership report: only child-1
			await testServer.server.app.inject({
				method: "POST",
				url: "/api/pods/ownership",
				payload: {
					parentSessionId: "parent-1",
					subagentIds: ["sub-a"],
				},
			});

			let podsResponse = await testServer.server.app.inject({
				method: "GET",
				url: "/api/pods",
			});
			let parentPod = podsResponse
				.json()
				.pods.find(
					(pod: { leadSessionId: string }) => pod.leadSessionId === "parent-1",
				);
			expect(parentPod.memberSessionIds).toContain("child-1");
			expect(parentPod.memberSessionIds).not.toContain("child-2");

			// Second ownership report: both children
			await testServer.server.app.inject({
				method: "POST",
				url: "/api/pods/ownership",
				payload: {
					parentSessionId: "parent-1",
					subagentIds: ["sub-a", "sub-b"],
				},
			});

			podsResponse = await testServer.server.app.inject({
				method: "GET",
				url: "/api/pods",
			});
			parentPod = podsResponse
				.json()
				.pods.find(
					(pod: { leadSessionId: string }) => pod.leadSessionId === "parent-1",
				);
			expect(parentPod.memberSessionIds).toContain("child-1");
			expect(parentPod.memberSessionIds).toContain("child-2");
		});
	});
});
