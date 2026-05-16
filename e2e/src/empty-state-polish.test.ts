import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	createTestHarness,
	MockSession,
	type TestHarness,
} from "./helpers/index.js";

describe("Empty State + Polish", () => {
	let harness: TestHarness;

	beforeEach(async () => {
		harness = await createTestHarness();
	});

	afterEach(async () => {
		await harness.cleanup();
	});

	describe("empty state: zero sessions", () => {
		it("returns empty session list", async () => {
			const res = await fetch(`${harness.baseUrl}/api/sessions`);
			const body = await res.json();
			expect(body.sessions).toHaveLength(0);
		});

		it("returns empty pod list", async () => {
			const res = await fetch(`${harness.baseUrl}/api/pods`);
			const body = await res.json();
			expect(body.pods).toHaveLength(0);
		});

		it("health endpoint reports zero sessions and pods", async () => {
			const res = await fetch(`${harness.baseUrl}/api/health`);
			const body = await res.json();
			expect(body.status).toBe("ok");
			expect(body.sessions).toBe(0);
			expect(body.pods).toBe(0);
		});
	});

	describe("empty state: zero clusters", () => {
		it("returns empty cluster list with unclustered section", async () => {
			const res = await fetch(`${harness.baseUrl}/api/clusters`);
			const body = await res.json();
			expect(body.clusters).toHaveLength(0);
			expect(body.unclustered).toBeDefined();
			expect(body.unclustered.podIds).toHaveLength(0);
		});

		it("sessions without clusters appear in unclustered", async () => {
			const session = new MockSession(harness.baseUrl, {
				cwd: "/Users/test/random/",
			});
			await session.register();

			const res = await fetch(`${harness.baseUrl}/api/clusters`);
			const body = await res.json();
			expect(body.unclustered.podIds).toContain(session.sessionId);
		});
	});

	describe("pi-watch conflict detection", () => {
		it("health endpoint includes piWatchDetected field", async () => {
			const res = await fetch(`${harness.baseUrl}/api/health`);
			const body = await res.json();
			// piWatchDetected is a boolean (value depends on test environment)
			expect(typeof body.piWatchDetected).toBe("boolean");
		});
	});

	describe("empty state disappears on first session", () => {
		it("session list transitions from empty to populated", async () => {
			// Initially empty
			let res = await fetch(`${harness.baseUrl}/api/sessions`);
			let body = await res.json();
			expect(body.sessions).toHaveLength(0);

			// Register first session
			const session = new MockSession(harness.baseUrl, {
				agentName: "first-session",
			});
			await session.register();

			// Now populated
			res = await fetch(`${harness.baseUrl}/api/sessions`);
			body = await res.json();
			expect(body.sessions).toHaveLength(1);
			expect(body.sessions[0].agentName).toBe("first-session");
		});
	});

	describe("extension install does not require app restart", () => {
		it("new sessions register immediately without server restart", async () => {
			// This verifies the server is always ready to accept registrations
			const session1 = new MockSession(harness.baseUrl);
			const res1 = await session1.register();
			expect(res1.status).toBe(201);

			const session2 = new MockSession(harness.baseUrl);
			const res2 = await session2.register();
			expect(res2.status).toBe(201);

			const listRes = await fetch(`${harness.baseUrl}/api/sessions`);
			const listBody = await listRes.json();
			expect(listBody.sessions).toHaveLength(2);
		});
	});
});
