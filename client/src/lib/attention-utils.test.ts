import { describe, it, expect } from "vitest";
import type { RegisteredSession } from "@pi-fleet/shared";
import {
	isAttentionState,
	getStateChangedAt,
	isSessionDismissed,
	computeVisibleAttentionCount,
} from "./attention-utils";

function buildSession(
	overrides?: Partial<RegisteredSession>,
): RegisteredSession {
	return {
		sessionId: "session-1",
		pid: 1234,
		cwd: "/home/user/project",
		tmuxTarget: "%0",
		startTime: "2025-01-01T00:00:00Z",
		activity: "processing",
		lastSeen: "2025-01-01T00:05:00Z",
		lastEventTime: "2025-01-01T00:05:00Z",
		...overrides,
	};
}

describe("getStateChangedAt", () => {
	it("returns activityChangedAt value when present in map", () => {
		const session = buildSession({
			sessionId: "s1",
			lastSeen: "2025-01-01T00:05:00Z",
		});
		const activityChangedAt = new Map([["s1", "2025-01-01T00:10:00Z"]]);

		const result = getStateChangedAt("s1", activityChangedAt, session);
		expect(result).toBe("2025-01-01T00:10:00Z");
	});

	it("falls back to session.lastSeen when not in activityChangedAt map", () => {
		const session = buildSession({
			sessionId: "s1",
			lastSeen: "2025-01-01T00:05:00Z",
		});
		const activityChangedAt = new Map<string, string>();

		const result = getStateChangedAt("s1", activityChangedAt, session);
		expect(result).toBe("2025-01-01T00:05:00Z");
	});

	it("never returns empty string", () => {
		const session = buildSession({
			sessionId: "s1",
			lastSeen: "2025-01-01T00:01:00Z",
		});
		const activityChangedAt = new Map<string, string>();

		const result = getStateChangedAt("s1", activityChangedAt, session);
		expect(result).not.toBe("");
		expect(result.length).toBeGreaterThan(0);
	});
});

describe("isSessionDismissed", () => {
	it("returns false when session is not in dismissed map", () => {
		const session = buildSession({ sessionId: "s1" });
		const activityChangedAt = new Map([["s1", "2025-01-01T00:01:00Z"]]);
		const dismissed = new Map<string, { dismissedStateChangedAt: string }>();

		expect(
			isSessionDismissed("s1", activityChangedAt, session, dismissed),
		).toBe(false);
	});

	it("returns true when stateChangedAt equals dismissedStateChangedAt", () => {
		const session = buildSession({ sessionId: "s1" });
		const activityChangedAt = new Map([["s1", "2025-01-01T00:01:00Z"]]);
		const dismissed = new Map([
			["s1", { dismissedStateChangedAt: "2025-01-01T00:01:00Z" }],
		]);

		expect(
			isSessionDismissed("s1", activityChangedAt, session, dismissed),
		).toBe(true);
	});

	it("returns true when stateChangedAt is older than dismissedStateChangedAt", () => {
		const session = buildSession({ sessionId: "s1" });
		const activityChangedAt = new Map([["s1", "2025-01-01T00:01:00Z"]]);
		const dismissed = new Map([
			["s1", { dismissedStateChangedAt: "2025-01-01T00:05:00Z" }],
		]);

		expect(
			isSessionDismissed("s1", activityChangedAt, session, dismissed),
		).toBe(true);
	});

	it("returns false when session has cycled (stateChangedAt > dismissedStateChangedAt)", () => {
		const session = buildSession({ sessionId: "s1" });
		const activityChangedAt = new Map([["s1", "2025-01-01T00:10:00Z"]]);
		const dismissed = new Map([
			["s1", { dismissedStateChangedAt: "2025-01-01T00:01:00Z" }],
		]);

		expect(
			isSessionDismissed("s1", activityChangedAt, session, dismissed),
		).toBe(false);
	});

	it("uses lastSeen fallback when activityChangedAt is missing", () => {
		const session = buildSession({
			sessionId: "s1",
			lastSeen: "2025-01-01T00:10:00Z",
		});
		const activityChangedAt = new Map<string, string>();
		const dismissed = new Map([
			["s1", { dismissedStateChangedAt: "2025-01-01T00:05:00Z" }],
		]);

		// lastSeen (00:10) > dismissed (00:05), so NOT dismissed
		expect(
			isSessionDismissed("s1", activityChangedAt, session, dismissed),
		).toBe(false);
	});

	it("dismissed then state changed then back to attention: visible again", () => {
		// Simulates: session was idle, dismissed at T1, went processing, came back idle at T2
		// activityChangedAt is set to T2 (when it went idle again)
		const session = buildSession({ sessionId: "s1", activity: "idle" });
		const activityChangedAt = new Map([["s1", "2025-01-01T00:20:00Z"]]);
		const dismissed = new Map([
			["s1", { dismissedStateChangedAt: "2025-01-01T00:10:00Z" }],
		]);

		// T2 (00:20) > dismissed (00:10), so NOT dismissed — visible again
		expect(
			isSessionDismissed("s1", activityChangedAt, session, dismissed),
		).toBe(false);
	});
});

describe("computeVisibleAttentionCount", () => {
	it("counts sessions in attention states", () => {
		const sessions = new Map([
			["s1", buildSession({ sessionId: "s1", activity: "idle" })],
			["s2", buildSession({ sessionId: "s2", activity: "pending_approval" })],
			["s3", buildSession({ sessionId: "s3", activity: "processing" })],
		]);
		const activityChangedAt = new Map([
			["s1", "2025-01-01T00:01:00Z"],
			["s2", "2025-01-01T00:02:00Z"],
			["s3", "2025-01-01T00:03:00Z"],
		]);
		const dismissed = new Map<string, { dismissedStateChangedAt: string }>();

		expect(
			computeVisibleAttentionCount(sessions, activityChangedAt, dismissed),
		).toBe(2);
	});

	it("excludes dismissed sessions from count", () => {
		const sessions = new Map([
			["s1", buildSession({ sessionId: "s1", activity: "idle" })],
			["s2", buildSession({ sessionId: "s2", activity: "pending_approval" })],
			["s3", buildSession({ sessionId: "s3", activity: "idle" })],
		]);
		const activityChangedAt = new Map([
			["s1", "2025-01-01T00:01:00Z"],
			["s2", "2025-01-01T00:02:00Z"],
			["s3", "2025-01-01T00:03:00Z"],
		]);
		const dismissed = new Map([
			["s1", { dismissedStateChangedAt: "2025-01-01T00:01:00Z" }],
		]);

		expect(
			computeVisibleAttentionCount(sessions, activityChangedAt, dismissed),
		).toBe(2);
	});

	it("includes cycled sessions (stateChangedAt newer than dismissal)", () => {
		const sessions = new Map([
			["s1", buildSession({ sessionId: "s1", activity: "idle" })],
		]);
		const activityChangedAt = new Map([["s1", "2025-01-01T00:10:00Z"]]);
		const dismissed = new Map([
			["s1", { dismissedStateChangedAt: "2025-01-01T00:01:00Z" }],
		]);

		expect(
			computeVisibleAttentionCount(sessions, activityChangedAt, dismissed),
		).toBe(1);
	});

	it("returns 0 when all attention sessions are dismissed", () => {
		const sessions = new Map([
			["s1", buildSession({ sessionId: "s1", activity: "idle" })],
			["s2", buildSession({ sessionId: "s2", activity: "pending_approval" })],
		]);
		const activityChangedAt = new Map([
			["s1", "2025-01-01T00:01:00Z"],
			["s2", "2025-01-01T00:02:00Z"],
		]);
		const dismissed = new Map([
			["s1", { dismissedStateChangedAt: "2025-01-01T00:01:00Z" }],
			["s2", { dismissedStateChangedAt: "2025-01-01T00:02:00Z" }],
		]);

		expect(
			computeVisibleAttentionCount(sessions, activityChangedAt, dismissed),
		).toBe(0);
	});

	it("returns 0 when no sessions need attention", () => {
		const sessions = new Map([
			["s1", buildSession({ sessionId: "s1", activity: "processing" })],
			["s2", buildSession({ sessionId: "s2", activity: "running_tool" })],
		]);
		const activityChangedAt = new Map([
			["s1", "2025-01-01T00:01:00Z"],
			["s2", "2025-01-01T00:02:00Z"],
		]);
		const dismissed = new Map<string, { dismissedStateChangedAt: string }>();

		expect(
			computeVisibleAttentionCount(sessions, activityChangedAt, dismissed),
		).toBe(0);
	});

	it("uses lastSeen fallback for dismiss comparison when activityChangedAt missing", () => {
		const sessions = new Map([
			[
				"s1",
				buildSession({
					sessionId: "s1",
					activity: "idle",
					lastSeen: "2025-01-01T00:05:00Z",
				}),
			],
		]);
		const activityChangedAt = new Map<string, string>(); // empty
		const dismissed = new Map([
			["s1", { dismissedStateChangedAt: "2025-01-01T00:05:00Z" }],
		]);

		// lastSeen (00:05) <= dismissed (00:05) → dismissed
		expect(
			computeVisibleAttentionCount(sessions, activityChangedAt, dismissed),
		).toBe(0);
	});

	it("handles mixed: attention, non-attention, dismissed, and cycled sessions", () => {
		const sessions = new Map([
			["s1", buildSession({ sessionId: "s1", activity: "idle" })], // dismissed
			["s2", buildSession({ sessionId: "s2", activity: "pending_approval" })], // cycled → visible
			["s3", buildSession({ sessionId: "s3", activity: "idle" })], // not dismissed → visible
			["s4", buildSession({ sessionId: "s4", activity: "processing" })], // non-attention
		]);
		const activityChangedAt = new Map([
			["s1", "2025-01-01T00:01:00Z"],
			["s2", "2025-01-01T00:10:00Z"],
			["s3", "2025-01-01T00:03:00Z"],
			["s4", "2025-01-01T00:04:00Z"],
		]);
		const dismissed = new Map([
			["s1", { dismissedStateChangedAt: "2025-01-01T00:01:00Z" }],
			["s2", { dismissedStateChangedAt: "2025-01-01T00:02:00Z" }],
		]);

		expect(
			computeVisibleAttentionCount(sessions, activityChangedAt, dismissed),
		).toBe(2);
	});
});

describe("isAttentionState re-export", () => {
	it("re-exports isAttentionState from shared", () => {
		expect(isAttentionState("pending_approval")).toBe(true);
		expect(isAttentionState("idle")).toBe(true);
		expect(isAttentionState("processing")).toBe(false);
		expect(isAttentionState("running_tool")).toBe(false);
	});
});
