import { describe, it, expect } from "vitest";
import { deriveNotificationEntries } from "./derive-notifications";
import type {
	RegisteredSession,
	Pod,
	ClusterDefinition,
} from "@pi-fleet/shared";

function buildSession(
	overrides?: Partial<RegisteredSession>,
): RegisteredSession {
	return {
		sessionId: "session-1",
		pid: 1234,
		cwd: "/Users/alice/projects/app",
		tmuxTarget: "%0",
		startTime: "2025-01-01T00:00:00Z",
		activity: "processing",
		lastSeen: "2025-01-01T00:01:00Z",
		lastEventTime: "2025-01-01T00:01:00Z",
		...overrides,
	};
}

function buildPod(overrides?: Partial<Pod>): Pod {
	return {
		leadSessionId: "session-1",
		memberSessionIds: ["session-1"],
		displayName: "Test Pod",
		state: "processing",
		attentionCount: 0,
		...overrides,
	};
}

function buildCluster(
	overrides?: Partial<ClusterDefinition>,
): ClusterDefinition {
	return {
		id: "cluster-1",
		name: "Work",
		directories: ["~/projects"],
		sortOrder: 0,
		...overrides,
	};
}

const homedir = "/Users/alice";

describe("deriveNotificationEntries", () => {
	it("returns empty array when no sessions need attention", () => {
		const sessions = new Map([
			["s1", buildSession({ sessionId: "s1", activity: "processing" })],
		]);
		const pods = new Map<string, Pod>();
		const activityChangedAt = new Map([["s1", "2025-01-01T00:00:00Z"]]);

		const result = deriveNotificationEntries(
			sessions,
			pods,
			activityChangedAt,
			[],
			{},
			homedir,
		);
		expect(result).toEqual([]);
	});

	it("returns entries only for pending_approval and idle sessions", () => {
		const sessions = new Map([
			[
				"s1",
				buildSession({
					sessionId: "s1",
					activity: "pending_approval",
					agentName: "agent-a",
				}),
			],
			[
				"s2",
				buildSession({
					sessionId: "s2",
					activity: "idle",
					agentName: "agent-b",
				}),
			],
			[
				"s3",
				buildSession({
					sessionId: "s3",
					activity: "processing",
					agentName: "agent-c",
				}),
			],
			[
				"s4",
				buildSession({
					sessionId: "s4",
					activity: "running_tool",
					agentName: "agent-d",
				}),
			],
		]);
		const pods = new Map<string, Pod>();
		const activityChangedAt = new Map([
			["s1", "2025-01-01T00:01:00Z"],
			["s2", "2025-01-01T00:02:00Z"],
			["s3", "2025-01-01T00:03:00Z"],
			["s4", "2025-01-01T00:04:00Z"],
		]);

		const result = deriveNotificationEntries(
			sessions,
			pods,
			activityChangedAt,
			[],
			{},
			homedir,
		);
		expect(result).toHaveLength(2);
		expect(result[0].sessionId).toBe("s2"); // More recent
		expect(result[1].sessionId).toBe("s1");
	});

	it("sorts entries by activityChangedAt descending", () => {
		const sessions = new Map([
			["s1", buildSession({ sessionId: "s1", activity: "idle" })],
			["s2", buildSession({ sessionId: "s2", activity: "idle" })],
			["s3", buildSession({ sessionId: "s3", activity: "pending_approval" })],
		]);
		const pods = new Map<string, Pod>();
		const activityChangedAt = new Map([
			["s1", "2025-01-01T00:01:00Z"],
			["s2", "2025-01-01T00:05:00Z"],
			["s3", "2025-01-01T00:03:00Z"],
		]);

		const result = deriveNotificationEntries(
			sessions,
			pods,
			activityChangedAt,
			[],
			{},
			homedir,
		);
		expect(result[0].sessionId).toBe("s2");
		expect(result[1].sessionId).toBe("s3");
		expect(result[2].sessionId).toBe("s1");
	});

	it("uses pod displayName for podDisplayName field", () => {
		const sessions = new Map([
			[
				"s1",
				buildSession({
					sessionId: "s1",
					activity: "idle",
					agentName: "my-agent",
				}),
			],
		]);
		const pods = new Map([
			[
				"lead-1",
				buildPod({
					leadSessionId: "lead-1",
					memberSessionIds: ["s1"],
					displayName: "My Pod",
				}),
			],
		]);
		const activityChangedAt = new Map([["s1", "2025-01-01T00:01:00Z"]]);

		const result = deriveNotificationEntries(
			sessions,
			pods,
			activityChangedAt,
			[],
			{},
			homedir,
		);
		expect(result[0].podDisplayName).toBe("My Pod");
	});

	it("uses agentName for sessionName, falls back to cwd directory", () => {
		const sessions = new Map([
			[
				"s1",
				buildSession({
					sessionId: "s1",
					activity: "idle",
					agentName: "named-agent",
				}),
			],
			[
				"s2",
				buildSession({
					sessionId: "s2",
					activity: "idle",
					agentName: undefined,
					cwd: "/Users/alice/my-project",
				}),
			],
		]);
		const pods = new Map<string, Pod>();
		const activityChangedAt = new Map([
			["s1", "2025-01-01T00:02:00Z"],
			["s2", "2025-01-01T00:01:00Z"],
		]);

		const result = deriveNotificationEntries(
			sessions,
			pods,
			activityChangedAt,
			[],
			{},
			homedir,
		);
		expect(result[0].sessionName).toBe("named-agent");
		expect(result[1].sessionName).toBe("my-project");
	});

	it("falls back to lastSeen when activityChangedAt missing", () => {
		const sessions = new Map([
			[
				"s1",
				buildSession({
					sessionId: "s1",
					activity: "idle",
					lastSeen: "2025-01-01T00:10:00Z",
				}),
			],
		]);
		const pods = new Map<string, Pod>();
		const activityChangedAt = new Map<string, string>(); // empty

		const result = deriveNotificationEntries(
			sessions,
			pods,
			activityChangedAt,
			[],
			{},
			homedir,
		);
		expect(result[0].stateChangedAt).toBe("2025-01-01T00:10:00Z");
	});

	it("resolves cluster name from assignment algorithm", () => {
		const sessions = new Map([
			[
				"pod-lead-1",
				buildSession({
					sessionId: "pod-lead-1",
					activity: "idle",
					agentName: "agent-in-cluster",
					cwd: "/Users/alice/projects/app",
				}),
			],
			[
				"pod-lead-2",
				buildSession({
					sessionId: "pod-lead-2",
					activity: "pending_approval",
					agentName: "agent-unclustered",
					cwd: "/tmp/random",
				}),
			],
		]);
		const pods = new Map([
			[
				"pod-lead-1",
				buildPod({
					leadSessionId: "pod-lead-1",
					memberSessionIds: ["pod-lead-1"],
					displayName: "Clustered Pod",
				}),
			],
			[
				"pod-lead-2",
				buildPod({
					leadSessionId: "pod-lead-2",
					memberSessionIds: ["pod-lead-2"],
					displayName: "Unclustered Pod",
				}),
			],
		]);
		const activityChangedAt = new Map([
			["pod-lead-1", "2025-01-01T00:02:00Z"],
			["pod-lead-2", "2025-01-01T00:01:00Z"],
		]);
		const clusters = [
			buildCluster({ id: "c1", name: "Work", directories: ["~/projects"] }),
		];

		const result = deriveNotificationEntries(
			sessions,
			pods,
			activityChangedAt,
			clusters,
			{},
			homedir,
		);

		expect(result[0].sessionId).toBe("pod-lead-1");
		expect(result[0].clusterName).toBe("Work");
		expect(result[1].sessionId).toBe("pod-lead-2");
		expect(result[1].clusterName).toBeNull();
	});

	it("returns null clusterName when session has no pod", () => {
		const sessions = new Map([
			["s1", buildSession({ sessionId: "s1", activity: "idle" })],
		]);
		const pods = new Map<string, Pod>(); // no pods
		const activityChangedAt = new Map([["s1", "2025-01-01T00:01:00Z"]]);
		const clusters = [
			buildCluster({ id: "c1", name: "Work", directories: ["~/projects"] }),
		];

		const result = deriveNotificationEntries(
			sessions,
			pods,
			activityChangedAt,
			clusters,
			{},
			homedir,
		);
		expect(result[0].clusterName).toBeNull();
	});
});
