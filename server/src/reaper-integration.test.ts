import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SessionRegistry } from "./session-registry.js";
import { PodRegistry } from "./pod-registry.js";
import { EventBus } from "./event-bus.js";
import type { SSEEvent, RegisterBody } from "@pi-fleet/shared";

vi.mock("./utils/logger.js", () => ({
	log: vi.fn(),
}));

function buildRegisterBody(overrides?: Partial<RegisterBody>): RegisterBody {
	return {
		sessionId: "sess-1",
		pid: 1234,
		cwd: "/Users/test/project",
		tmuxTarget: "%0",
		startTime: "2025-01-01T00:00:00.000Z",
		...overrides,
	};
}

describe("Reaper Integration", () => {
	let registry: SessionRegistry;
	let podRegistry: PodRegistry;
	let eventBus: EventBus;
	let broadcastedEvents: SSEEvent[];
	let currentTime: number;

	beforeEach(() => {
		vi.useFakeTimers();
		currentTime = new Date("2025-01-01T00:00:00.000Z").getTime();

		registry = new SessionRegistry({
			now: () => currentTime,
			reapTimeoutMs: 15_000,
		});
		podRegistry = new PodRegistry({ sessionRegistry: registry });
		eventBus = new EventBus();
		broadcastedEvents = [];

		// Wire the same event bridge as server.ts
		registry.onEvent((event) => {
			switch (event.type) {
				case "session:added":
					eventBus.broadcast({ type: "session:added", data: event.session });
					podRegistry.handleSessionRegistered(event.session.sessionId);
					break;
				case "session:updated":
					eventBus.broadcast({ type: "session:updated", data: event.session });
					podRegistry.handleSessionUpdated(event.session.sessionId);
					break;
				case "session:removed":
					eventBus.broadcast({
						type: "session:removed",
						data: { sessionId: event.sessionId },
					});
					podRegistry.handleSessionRemoved(event.sessionId);
					break;
			}
		});

		podRegistry.onEvent((event) => {
			switch (event.type) {
				case "pod:formed":
					eventBus.broadcast({ type: "pod:formed", data: event.pod });
					break;
				case "pod:updated":
					eventBus.broadcast({ type: "pod:updated", data: event.pod });
					break;
				case "pod:dissolved":
					eventBus.broadcast({
						type: "pod:dissolved",
						data: { leadSessionId: event.leadSessionId },
					});
					break;
			}
		});

		// Capture all broadcasts
		const originalBroadcast = eventBus.broadcast.bind(eventBus);
		eventBus.broadcast = (event: SSEEvent) => {
			broadcastedEvents.push(event);
			originalBroadcast(event);
		};
	});

	afterEach(() => {
		registry.dispose();
		vi.useRealTimers();
	});

	describe("startReaper triggers reap on interval", () => {
		it("reaps stale sessions when timer fires", () => {
			registry.register(buildRegisterBody({ sessionId: "sess-1" }));
			broadcastedEvents = [];

			registry.startReaper(5000);

			// Advance time past the reap timeout
			currentTime += 16_000;
			vi.advanceTimersByTime(5000);

			expect(registry.size).toBe(0);
			const removedEvents = broadcastedEvents.filter(
				(event) => event.type === "session:removed",
			);
			expect(removedEvents).toHaveLength(1);
			expect(removedEvents[0]).toEqual({
				type: "session:removed",
				data: { sessionId: "sess-1" },
			});
		});

		it("does not reap sessions that received recent heartbeats", () => {
			registry.register(buildRegisterBody({ sessionId: "sess-1" }));
			broadcastedEvents = [];

			registry.startReaper(5000);

			// Advance time 10s (within timeout) and send a heartbeat
			currentTime += 10_000;
			registry.heartbeat({
				sessionId: "sess-1",
				activity: "processing",
				lastEventTime: new Date(currentTime).toISOString(),
			});

			// Advance another 10s (20s from start, but only 10s since heartbeat)
			currentTime += 10_000;
			vi.advanceTimersByTime(20_000);

			expect(registry.size).toBe(1);
			const removedEvents = broadcastedEvents.filter(
				(event) => event.type === "session:removed",
			);
			expect(removedEvents).toHaveLength(0);
		});

		it("reaps multiple stale sessions in one pass", () => {
			registry.register(buildRegisterBody({ sessionId: "sess-1" }));
			registry.register(buildRegisterBody({ sessionId: "sess-2" }));
			registry.register(buildRegisterBody({ sessionId: "sess-3" }));
			broadcastedEvents = [];

			registry.startReaper(5000);

			currentTime += 16_000;
			vi.advanceTimersByTime(5000);

			expect(registry.size).toBe(0);
			const removedEvents = broadcastedEvents.filter(
				(event) => event.type === "session:removed",
			);
			expect(removedEvents).toHaveLength(3);
		});

		it("reaps repeatedly across multiple intervals", () => {
			registry.register(buildRegisterBody({ sessionId: "sess-1" }));
			broadcastedEvents = [];

			registry.startReaper(5000);

			// First interval: not stale yet
			currentTime += 10_000;
			vi.advanceTimersByTime(5000);
			expect(registry.size).toBe(1);

			// Register a second session at t+10s
			registry.register(buildRegisterBody({ sessionId: "sess-2" }));
			broadcastedEvents = [];

			// Second interval at t+16s: sess-1 is stale, sess-2 is fresh
			currentTime += 6_000;
			vi.advanceTimersByTime(5000);

			expect(registry.size).toBe(1);
			expect(registry.get("sess-1")).toBeUndefined();
			expect(registry.get("sess-2")).toBeDefined();

			const removedEvents = broadcastedEvents.filter(
				(event) => event.type === "session:removed",
			);
			expect(removedEvents).toHaveLength(1);
		});
	});

	describe("reaper triggers downstream pod dissolution", () => {
		it("dissolves pod when parent session is reaped", () => {
			// Register parent and child
			registry.register(
				buildRegisterBody({ sessionId: "parent-1", cwd: "/project" }),
			);
			registry.register(
				buildRegisterBody({
					sessionId: "child-1",
					subagentId: "sub-1",
					cwd: "/project",
				}),
			);

			// Establish pod ownership
			podRegistry.reportOwnership("parent-1", ["sub-1"]);
			broadcastedEvents = [];

			registry.startReaper(5000);

			// Advance past timeout: both sessions go stale
			currentTime += 16_000;
			vi.advanceTimersByTime(5000);

			expect(registry.size).toBe(0);

			const dissolvedEvents = broadcastedEvents.filter(
				(event) => event.type === "pod:dissolved",
			);
			expect(dissolvedEvents.length).toBeGreaterThanOrEqual(1);
		});

		it("updates pod when child session is reaped but parent lives", () => {
			// Register parent and child
			registry.register(
				buildRegisterBody({ sessionId: "parent-1", cwd: "/project" }),
			);

			// Advance 5s, register child
			currentTime += 5_000;
			registry.register(
				buildRegisterBody({
					sessionId: "child-1",
					subagentId: "sub-1",
					cwd: "/project",
				}),
			);

			podRegistry.reportOwnership("parent-1", ["sub-1"]);
			broadcastedEvents = [];

			registry.startReaper(5000);

			// Advance 11s more: parent is 16s old (stale), child is 11s old (not stale)
			// Actually, let's heartbeat the parent to keep it alive
			currentTime += 10_000;
			registry.heartbeat({
				sessionId: "parent-1",
				activity: "idle",
				lastEventTime: new Date(currentTime).toISOString(),
			});
			broadcastedEvents = [];

			// Advance 11s: child is now 16s since last seen (stale), parent is 11s (fresh)
			currentTime += 11_000;
			vi.advanceTimersByTime(15_000);

			expect(registry.get("parent-1")).toBeDefined();
			expect(registry.get("child-1")).toBeUndefined();

			const podUpdatedEvents = broadcastedEvents.filter(
				(event) => event.type === "pod:updated",
			);
			expect(podUpdatedEvents.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("stopReaper prevents further reaping", () => {
		it("no reaping occurs after stopReaper", () => {
			registry.register(buildRegisterBody({ sessionId: "sess-1" }));
			broadcastedEvents = [];

			registry.startReaper(5000);
			registry.stopReaper();

			currentTime += 16_000;
			vi.advanceTimersByTime(10_000);

			expect(registry.size).toBe(1);
			const removedEvents = broadcastedEvents.filter(
				(event) => event.type === "session:removed",
			);
			expect(removedEvents).toHaveLength(0);
		});
	});
});
