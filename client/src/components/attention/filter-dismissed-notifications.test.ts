import { describe, it, expect } from "vitest";
import { filterDismissedNotifications } from "./filter-dismissed-notifications";
import type { NotificationEntry } from "./types";
import type { DismissedNotification } from "@/stores/notification-dismiss-store";

function buildEntry(overrides?: Partial<NotificationEntry>): NotificationEntry {
	return {
		sessionId: "session-1",
		sessionName: "test-agent",
		podDisplayName: "Test Pod",
		clusterName: null,
		state: "idle",
		stateChangedAt: "2025-01-01T00:01:00Z",
		...overrides,
	};
}

describe("filterDismissedNotifications", () => {
	it("returns all entries when dismissed map is empty", () => {
		const entries = [
			buildEntry({ sessionId: "s1" }),
			buildEntry({ sessionId: "s2" }),
			buildEntry({ sessionId: "s3" }),
		];
		const dismissed = new Map<string, DismissedNotification>();

		const result = filterDismissedNotifications(entries, dismissed);
		expect(result).toHaveLength(3);
	});

	it("filters out a dismissed entry with matching stateChangedAt", () => {
		const entries = [
			buildEntry({ sessionId: "s1", stateChangedAt: "2025-01-01T00:01:00Z" }),
			buildEntry({ sessionId: "s2", stateChangedAt: "2025-01-01T00:02:00Z" }),
		];
		const dismissed = new Map<string, DismissedNotification>([
			["s1", { dismissedStateChangedAt: "2025-01-01T00:01:00Z" }],
		]);

		const result = filterDismissedNotifications(entries, dismissed);
		expect(result).toHaveLength(1);
		expect(result[0].sessionId).toBe("s2");
	});

	it("keeps a cycled session (newer stateChangedAt than dismissal)", () => {
		const entries = [
			buildEntry({ sessionId: "s1", stateChangedAt: "2025-01-01T00:10:00Z" }),
		];
		const dismissed = new Map<string, DismissedNotification>([
			["s1", { dismissedStateChangedAt: "2025-01-01T00:01:00Z" }],
		]);

		const result = filterDismissedNotifications(entries, dismissed);
		expect(result).toHaveLength(1);
		expect(result[0].sessionId).toBe("s1");
	});

	it("filters out all entries when all are dismissed (clear all scenario)", () => {
		const entries = [
			buildEntry({ sessionId: "s1", stateChangedAt: "2025-01-01T00:01:00Z" }),
			buildEntry({ sessionId: "s2", stateChangedAt: "2025-01-01T00:02:00Z" }),
			buildEntry({ sessionId: "s3", stateChangedAt: "2025-01-01T00:03:00Z" }),
		];
		const dismissed = new Map<string, DismissedNotification>([
			["s1", { dismissedStateChangedAt: "2025-01-01T00:01:00Z" }],
			["s2", { dismissedStateChangedAt: "2025-01-01T00:02:00Z" }],
			["s3", { dismissedStateChangedAt: "2025-01-01T00:03:00Z" }],
		]);

		const result = filterDismissedNotifications(entries, dismissed);
		expect(result).toHaveLength(0);
	});

	it("does not affect entries for sessions not in dismissed map", () => {
		const entries = [
			buildEntry({ sessionId: "s1", stateChangedAt: "2025-01-01T00:01:00Z" }),
			buildEntry({ sessionId: "s3", stateChangedAt: "2025-01-01T00:03:00Z" }),
		];
		const dismissed = new Map<string, DismissedNotification>([
			["s2", { dismissedStateChangedAt: "2025-01-01T00:02:00Z" }],
		]);

		const result = filterDismissedNotifications(entries, dismissed);
		expect(result).toHaveLength(2);
	});

	it("handles mix of dismissed, cycled, and non-dismissed entries", () => {
		const entries = [
			buildEntry({ sessionId: "s1", stateChangedAt: "2025-01-01T00:01:00Z" }), // dismissed (same timestamp)
			buildEntry({ sessionId: "s2", stateChangedAt: "2025-01-01T00:10:00Z" }), // cycled (newer timestamp)
			buildEntry({ sessionId: "s3", stateChangedAt: "2025-01-01T00:03:00Z" }), // not in dismissed map
		];
		const dismissed = new Map<string, DismissedNotification>([
			["s1", { dismissedStateChangedAt: "2025-01-01T00:01:00Z" }],
			["s2", { dismissedStateChangedAt: "2025-01-01T00:02:00Z" }],
		]);

		const result = filterDismissedNotifications(entries, dismissed);
		expect(result).toHaveLength(2);
		expect(result.map((entry) => entry.sessionId)).toEqual(["s2", "s3"]);
	});
});
