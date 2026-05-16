import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type PiFleetServer } from "./server.js";

describe("Pod Routes (integration)", () => {
	let server: PiFleetServer;

	beforeEach(async () => {
		server = createServer({ port: 0 });
		await server.start();
	});

	afterEach(async () => {
		await server.stop();
	});

	it("GET /api/pods returns empty pods initially", async () => {
		const response = await server.app.inject({
			method: "GET",
			url: "/api/pods",
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ pods: [] });
	});

	it("GET /api/pods returns single-member pods for registered sessions", async () => {
		// Register a session
		await server.app.inject({
			method: "POST",
			url: "/api/sessions/register",
			payload: {
				sessionId: "s1",
				pid: 1234,
				cwd: "/home/project",
				tmuxTarget: "main:1.0",
				startTime: new Date().toISOString(),
				agentName: "TestAgent",
			},
		});

		const response = await server.app.inject({
			method: "GET",
			url: "/api/pods",
		});

		const body = response.json();
		expect(body.pods).toHaveLength(1);
		expect(body.pods[0].leadSessionId).toBe("s1");
		expect(body.pods[0].memberSessionIds).toEqual(["s1"]);
		expect(body.pods[0].displayName).toBe("TestAgent");
	});

	it("POST /api/pods/ownership validates body", async () => {
		const response = await server.app.inject({
			method: "POST",
			url: "/api/pods/ownership",
			payload: { invalid: true },
		});

		expect(response.statusCode).toBe(400);
	});

	it("POST /api/pods/ownership returns matchedIds and unmatchedIds", async () => {
		// Register parent and child sessions
		await server.app.inject({
			method: "POST",
			url: "/api/sessions/register",
			payload: {
				sessionId: "parent",
				pid: 1000,
				cwd: "/home/main",
				tmuxTarget: "main:0.0",
				startTime: new Date().toISOString(),
			},
		});

		await server.app.inject({
			method: "POST",
			url: "/api/sessions/register",
			payload: {
				sessionId: "child-1",
				pid: 2000,
				cwd: "/home/sub",
				tmuxTarget: "main:1.0",
				startTime: new Date().toISOString(),
				subagentId: "agent-a",
			},
		});

		// Report ownership
		const response = await server.app.inject({
			method: "POST",
			url: "/api/pods/ownership",
			payload: {
				parentSessionId: "parent",
				subagentIds: ["agent-a", "agent-unknown"],
			},
		});

		expect(response.statusCode).toBe(200);
		const body = response.json();
		expect(body.ok).toBe(true);
		expect(body.matchedIds).toEqual(["agent-a"]);
		expect(body.unmatchedIds).toEqual(["agent-unknown"]);
	});

	it("GET /api/pods returns multi-member pod after ownership report", async () => {
		// Register parent
		await server.app.inject({
			method: "POST",
			url: "/api/sessions/register",
			payload: {
				sessionId: "parent",
				pid: 1000,
				cwd: "/home/main",
				tmuxTarget: "main:0.0",
				startTime: new Date().toISOString(),
				agentName: "Orchestrator",
			},
		});

		// Register child
		await server.app.inject({
			method: "POST",
			url: "/api/sessions/register",
			payload: {
				sessionId: "child-1",
				pid: 2000,
				cwd: "/home/sub",
				tmuxTarget: "main:1.0",
				startTime: new Date().toISOString(),
				subagentId: "agent-a",
			},
		});

		// Report ownership
		await server.app.inject({
			method: "POST",
			url: "/api/pods/ownership",
			payload: {
				parentSessionId: "parent",
				subagentIds: ["agent-a"],
			},
		});

		// Check pods
		const response = await server.app.inject({
			method: "GET",
			url: "/api/pods",
		});

		const body = response.json();
		const parentPod = body.pods.find(
			(p: { leadSessionId: string }) => p.leadSessionId === "parent",
		);
		expect(parentPod).toBeDefined();
		expect(parentPod.memberSessionIds).toContain("parent");
		expect(parentPod.memberSessionIds).toContain("child-1");
		expect(parentPod.displayName).toBe("Orchestrator");
	});

	it("unmatched subagentIds are picked up on late registration", async () => {
		// Register parent first
		await server.app.inject({
			method: "POST",
			url: "/api/sessions/register",
			payload: {
				sessionId: "parent",
				pid: 1000,
				cwd: "/home/main",
				tmuxTarget: "main:0.0",
				startTime: new Date().toISOString(),
			},
		});

		// Report ownership before child registers
		await server.app.inject({
			method: "POST",
			url: "/api/pods/ownership",
			payload: {
				parentSessionId: "parent",
				subagentIds: ["agent-late"],
			},
		});

		// Verify child isn't in pod yet
		let response = await server.app.inject({ method: "GET", url: "/api/pods" });
		let pods = response.json().pods;
		const parentPodBefore = pods.find(
			(p: { leadSessionId: string }) => p.leadSessionId === "parent",
		);
		expect(parentPodBefore.memberSessionIds).toHaveLength(1);

		// Now child registers with matching subagentId
		await server.app.inject({
			method: "POST",
			url: "/api/sessions/register",
			payload: {
				sessionId: "late-child",
				pid: 3000,
				cwd: "/home/late",
				tmuxTarget: "main:2.0",
				startTime: new Date().toISOString(),
				subagentId: "agent-late",
			},
		});

		// Verify child is now in parent's pod
		response = await server.app.inject({ method: "GET", url: "/api/pods" });
		pods = response.json().pods;
		const parentPodAfter = pods.find(
			(p: { leadSessionId: string }) => p.leadSessionId === "parent",
		);
		expect(parentPodAfter.memberSessionIds).toContain("late-child");
	});

	it("GET /api/health includes real pod count", async () => {
		// Register two sessions
		await server.app.inject({
			method: "POST",
			url: "/api/sessions/register",
			payload: {
				sessionId: "s1",
				pid: 1000,
				cwd: "/a",
				tmuxTarget: null,
				startTime: new Date().toISOString(),
			},
		});
		await server.app.inject({
			method: "POST",
			url: "/api/sessions/register",
			payload: {
				sessionId: "s2",
				pid: 2000,
				cwd: "/b",
				tmuxTarget: null,
				startTime: new Date().toISOString(),
			},
		});

		const response = await server.app.inject({
			method: "GET",
			url: "/api/health",
		});

		const body = response.json();
		expect(body.sessions).toBe(2);
		expect(body.pods).toBe(2);
	});
});
