import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionRegistry } from "./session-registry.js";
import type { SessionEvent } from "./session-registry.js";
import type { RegisterBody, HeartbeatBody } from "@pi-fleet/shared";

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

function buildHeartbeatBody(overrides?: Partial<HeartbeatBody>): HeartbeatBody {
	return {
		sessionId: "sess-1",
		activity: "processing",
		lastEventTime: "2025-01-01T00:00:05.000Z",
		...overrides,
	};
}

describe("SessionRegistry", () => {
	let registry: SessionRegistry;
	let events: SessionEvent[];
	const frozenTime = new Date("2025-01-01T00:00:00.000Z").getTime();

	beforeEach(() => {
		events = [];
		registry = new SessionRegistry({ now: () => frozenTime });
		registry.onEvent((event) => events.push(event));
	});

	describe("register", () => {
		it("stores a session and emits session:added", () => {
			const body = buildRegisterBody();
			const session = registry.register(body);

			expect(session.sessionId).toBe("sess-1");
			expect(session.activity).toBe("idle");
			expect(session.lastSeen).toBe("2025-01-01T00:00:00.000Z");
			expect(session.cwd).toBe("/Users/test/project");
			expect(session.tmuxTarget).toBe("%0");

			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("session:added");
		});

		it("includes optional fields when provided", () => {
			const body = buildRegisterBody({
				agentName: "pi-agent",
				subagentId: "sub-1",
				model: "Claude Sonnet 4",
				contextUsage: { tokens: 5000, contextWindow: 128000, percent: 4 },
				thinkingLevel: "high",
			});
			const session = registry.register(body);

			expect(session.agentName).toBe("pi-agent");
			expect(session.subagentId).toBe("sub-1");
			expect(session.model).toBe("Claude Sonnet 4");
			expect(session.contextUsage).toEqual({
				tokens: 5000,
				contextWindow: 128000,
				percent: 4,
			});
			expect(session.thinkingLevel).toBe("high");
		});

		it("treats duplicate registration as update", () => {
			registry.register(buildRegisterBody());
			registry.register(
				buildRegisterBody({ cwd: "/Users/test/other-project" }),
			);

			expect(registry.size).toBe(1);
			expect(registry.get("sess-1")!.cwd).toBe("/Users/test/other-project");

			expect(events).toHaveLength(2);
			expect(events[0].type).toBe("session:added");
			expect(events[1].type).toBe("session:updated");
		});
	});

	describe("heartbeat", () => {
		it("updates activity and lastSeen", () => {
			registry.register(buildRegisterBody());
			events.length = 0;

			const session = registry.heartbeat(buildHeartbeatBody());

			expect(session).toBeDefined();
			expect(session!.activity).toBe("processing");
			expect(session!.lastSeen).toBe("2025-01-01T00:00:00.000Z");
			expect(session!.lastEventTime).toBe("2025-01-01T00:00:05.000Z");

			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("session:updated");
		});

		it("merges optional fields only when present", () => {
			registry.register(buildRegisterBody({ model: "Claude Sonnet 4" }));

			// Heartbeat without model: should not overwrite
			registry.heartbeat(
				buildHeartbeatBody({ turnCount: 3, lastToolName: "read" }),
			);

			const session = registry.get("sess-1")!;
			expect(session.model).toBe("Claude Sonnet 4");
			expect(session.turnCount).toBe(3);
			expect(session.lastToolName).toBe("read");
		});

		it("merges all heartbeat fields when provided", () => {
			registry.register(buildRegisterBody());

			registry.heartbeat(
				buildHeartbeatBody({
					model: "Claude Opus 4",
					contextUsage: { tokens: 20000, contextWindow: 200000, percent: 10 },
					turnCount: 7,
					thinkingLevel: "medium",
					lastToolName: "bash",
					tmuxTarget: "%1",
					agentName: "new-agent",
				}),
			);

			const session = registry.get("sess-1")!;
			expect(session.model).toBe("Claude Opus 4");
			expect(session.contextUsage).toEqual({
				tokens: 20000,
				contextWindow: 200000,
				percent: 10,
			});
			expect(session.turnCount).toBe(7);
			expect(session.thinkingLevel).toBe("medium");
			expect(session.lastToolName).toBe("bash");
			expect(session.tmuxTarget).toBe("%1");
			expect(session.agentName).toBe("new-agent");
		});

		it("returns undefined for unknown session", () => {
			const result = registry.heartbeat(
				buildHeartbeatBody({ sessionId: "unknown" }),
			);
			expect(result).toBeUndefined();
			expect(events).toHaveLength(0);
		});
	});

	describe("unregister", () => {
		it("removes session and emits session:removed", () => {
			registry.register(buildRegisterBody());
			events.length = 0;

			const result = registry.unregister("sess-1");

			expect(result).toBe(true);
			expect(registry.size).toBe(0);
			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("session:removed");
			if (events[0].type === "session:removed") {
				expect(events[0].sessionId).toBe("sess-1");
			}
		});

		it("returns false for unknown session", () => {
			const result = registry.unregister("unknown");
			expect(result).toBe(false);
			expect(events).toHaveLength(0);
		});
	});

	describe("getAll", () => {
		it("returns all registered sessions", () => {
			registry.register(buildRegisterBody({ sessionId: "sess-1" }));
			registry.register(buildRegisterBody({ sessionId: "sess-2" }));

			const all = registry.getAll();
			expect(all).toHaveLength(2);
			const ids = all.map((session) => session.sessionId);
			expect(ids).toContain("sess-1");
			expect(ids).toContain("sess-2");
		});
	});

	describe("reap", () => {
		it("removes sessions past the timeout", () => {
			const baseTime = new Date("2025-01-01T00:00:00.000Z").getTime();
			let currentTime = baseTime;

			const reapRegistry = new SessionRegistry({
				now: () => currentTime,
				reapTimeoutMs: 15000,
			});
			reapRegistry.onEvent((event) => events.push(event));

			reapRegistry.register(buildRegisterBody({ sessionId: "sess-1" }));
			events.length = 0;

			// Advance time past the reap timeout
			currentTime = baseTime + 16000;

			const reaped = reapRegistry.reap();
			expect(reaped).toEqual(["sess-1"]);
			expect(reapRegistry.size).toBe(0);
			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("session:removed");
		});

		it("keeps sessions within the timeout", () => {
			const baseTime = new Date("2025-01-01T00:00:00.000Z").getTime();
			let currentTime = baseTime;

			const reapRegistry = new SessionRegistry({
				now: () => currentTime,
				reapTimeoutMs: 15000,
			});

			reapRegistry.register(buildRegisterBody());

			// Advance time but stay within reap timeout
			currentTime = baseTime + 10000;

			const reaped = reapRegistry.reap();
			expect(reaped).toEqual([]);
			expect(reapRegistry.size).toBe(1);
		});

		it("only reaps stale sessions, keeps fresh ones", () => {
			const baseTime = new Date("2025-01-01T00:00:00.000Z").getTime();
			let currentTime = baseTime;

			const reapRegistry = new SessionRegistry({
				now: () => currentTime,
				reapTimeoutMs: 15000,
			});

			reapRegistry.register(buildRegisterBody({ sessionId: "stale" }));

			// Advance 10s, register fresh session
			currentTime = baseTime + 10000;
			reapRegistry.register(buildRegisterBody({ sessionId: "fresh" }));

			// Advance to 16s total (stale session is 16s old, fresh is 6s old)
			currentTime = baseTime + 16000;

			const reaped = reapRegistry.reap();
			expect(reaped).toEqual(["stale"]);
			expect(reapRegistry.size).toBe(1);
			expect(reapRegistry.get("fresh")).toBeDefined();
		});
	});

	describe("event listener management", () => {
		it("unsubscribe stops delivering events", () => {
			const extraEvents: SessionEvent[] = [];
			const unsubscribe = registry.onEvent((event) => extraEvents.push(event));
			registry.register(buildRegisterBody({ sessionId: "sess-1" }));
			expect(extraEvents).toHaveLength(1);

			unsubscribe();
			registry.register(buildRegisterBody({ sessionId: "sess-2" }));
			// Extra listener stopped receiving, still just 1 event
			expect(extraEvents).toHaveLength(1);
			// But the beforeEach listener still got both
			expect(events).toHaveLength(2);
		});
	});

	describe("dispose", () => {
		it("clears all sessions and listeners", () => {
			registry.register(buildRegisterBody());
			registry.dispose();

			expect(registry.size).toBe(0);
			// No events after dispose
			events.length = 0;
			registry.register(buildRegisterBody());
			expect(events).toHaveLength(0);
		});
	});
});
