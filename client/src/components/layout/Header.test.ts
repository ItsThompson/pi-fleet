import { describe, it, expect } from "vitest";
import { computeVisibleAttentionCount } from "@/lib/attention-utils";
import type { RegisteredSession } from "@pi-fleet/shared";

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

describe("computeVisibleAttentionCount", () => {
	it("counts sessions needing attention (pending_approval and idle)", () => {
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

	it("includes cycled sessions (newer stateChangedAt than dismissal)", () => {
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

	it("uses lastSeen fallback when activityChangedAt is missing", () => {
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
		const activityChangedAt = new Map<string, string>();
		// lastSeen (00:05) <= dismissed (00:05) → dismissed
		const dismissed = new Map([
			["s1", { dismissedStateChangedAt: "2025-01-01T00:05:00Z" }],
		]);

		expect(
			computeVisibleAttentionCount(sessions, activityChangedAt, dismissed),
		).toBe(0);
	});
});
