import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	createTestHarness,
	MockSession,
	type TestHarness,
} from "./helpers/index.js";

/**
 * Smoke 5: Ghost Mode + Sound
 *
 * Ghost mode and sound are Electron desktop features that require the BrowserWindow
 * and shell APIs. This test suite verifies the server-side components that support
 * these features: specifically that activity state transitions are correctly reported
 * and that the server health endpoint reflects proper state for desktop clients
 * to act upon.
 *
 * Full ghost mode + sound E2E testing requires Electron (tested via desktop unit tests).
 */
describe("Smoke 5: Ghost Mode + Sound (Server-side Support)", () => {
	let harness: TestHarness;

	beforeEach(async () => {
		harness = await createTestHarness();
	});

	afterEach(async () => {
		await harness.cleanup();
	});

	it("idle transition is broadcast via SSE for sound trigger", async () => {
		const events: Array<{ type: string; data: unknown }> = [];
		const controller = new AbortController();

		const ssePromise = fetch(`${harness.baseUrl}/api/events`, {
			signal: controller.signal,
		})
			.then(async (res) => {
				const reader = res.body!.getReader();
				const decoder = new TextDecoder();
				let buffer = "";

				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						break;
					}
					buffer += decoder.decode(value, { stream: true });

					const frames = buffer.split("\n\n");
					buffer = frames.pop() ?? "";
					frames.forEach((frame) => {
						const eventMatch = frame.match(/^event: (.+)$/m);
						const dataMatch = frame.match(/^data: (.+)$/m);
						if (eventMatch && dataMatch) {
							events.push({
								type: eventMatch[1],
								data: JSON.parse(dataMatch[1]),
							});
						}
					});
				}
			})
			.catch(() => {});

		await new Promise((resolve) => setTimeout(resolve, 100));

		// Session transitions from processing to idle
		const session = new MockSession(harness.baseUrl, {
			agentName: "idle-test",
		});
		await session.register();
		await session.heartbeat("processing");
		await session.heartbeat("idle");

		await new Promise((resolve) => setTimeout(resolve, 100));
		controller.abort();
		await ssePromise;

		// Desktop client listens for session:updated events where activity changes
		// to an attention state to trigger sound
		const idleEvent = events.find(
			(e) =>
				e.type === "session:updated" &&
				(e.data as { activity: string }).activity === "idle",
		);
		expect(idleEvent).toBeDefined();
	});

	it("session activity state is available for desktop ghost-mode overlay", async () => {
		const session = new MockSession(harness.baseUrl, {
			agentName: "ghost-test",
		});
		await session.register();
		await session.heartbeat("running_tool", {
			lastToolName: "bash",
		});

		// Desktop client fetches sessions to display in ghost-mode overlay
		const listRes = await fetch(`${harness.baseUrl}/api/sessions`);
		const listBody = await listRes.json();
		expect(listBody.sessions[0].activity).toBe("running_tool");
		expect(listBody.sessions[0].lastToolName).toBe("bash");
	});

	it("health endpoint provides status for tray menu state display", async () => {
		// Register some sessions
		const session1 = new MockSession(harness.baseUrl);
		await session1.register();
		const session2 = new MockSession(harness.baseUrl);
		await session2.register();

		const healthRes = await fetch(`${harness.baseUrl}/api/health`);
		const healthBody = await healthRes.json();

		expect(healthBody.status).toBe("ok");
		expect(healthBody.sessions).toBe(2);
		expect(healthBody.pods).toBe(2);
		expect(healthBody.uptime).toBeGreaterThanOrEqual(0);
	});

	it("sound deduplication: repeated heartbeats with same state don't re-trigger", async () => {
		// This tests the server contract: repeated heartbeats with same activity
		// should show the same lastSeen update but SSE still fires session:updated
		// The desktop SoundManager handles dedup by tracking previous state per session
		const events: Array<{ type: string; data: unknown }> = [];
		const controller = new AbortController();

		const ssePromise = fetch(`${harness.baseUrl}/api/events`, {
			signal: controller.signal,
		})
			.then(async (res) => {
				const reader = res.body!.getReader();
				const decoder = new TextDecoder();
				let buffer = "";

				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						break;
					}
					buffer += decoder.decode(value, { stream: true });

					const frames = buffer.split("\n\n");
					buffer = frames.pop() ?? "";
					frames.forEach((frame) => {
						const eventMatch = frame.match(/^event: (.+)$/m);
						const dataMatch = frame.match(/^data: (.+)$/m);
						if (eventMatch && dataMatch) {
							events.push({
								type: eventMatch[1],
								data: JSON.parse(dataMatch[1]),
							});
						}
					});
				}
			})
			.catch(() => {});

		await new Promise((resolve) => setTimeout(resolve, 100));

		const session = new MockSession(harness.baseUrl);
		await session.register();

		// Send multiple heartbeats with same idle state
		await session.heartbeat("idle");
		await session.heartbeat("idle");
		await session.heartbeat("idle");

		await new Promise((resolve) => setTimeout(resolve, 100));
		controller.abort();
		await ssePromise;

		// All three should produce session:updated events
		// Desktop SoundManager uses its own dedup (lastState map) to only play once
		const idleUpdates = events.filter(
			(e) =>
				e.type === "session:updated" &&
				(e.data as { activity: string }).activity === "idle",
		);
		expect(idleUpdates.length).toBe(3);
	});
});
