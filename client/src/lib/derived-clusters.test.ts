import { describe, it, expect } from "vitest";
import type {
	Pod,
	RegisteredSession,
	ClusterDefinition,
} from "@pi-fleet/shared";
import {
	deriveClusterState,
	computePodAttention,
	getClusterForPod,
} from "./derived-clusters";

function buildPod(overrides?: Partial<Pod>): Pod {
	return {
		leadSessionId: "pod-1",
		memberSessionIds: ["pod-1"],
		displayName: "Test Pod",
		state: "processing",
		attentionCount: 0,
		...overrides,
	};
}

function buildSession(
	overrides?: Partial<RegisteredSession>,
): RegisteredSession {
	return {
		sessionId: "session-1",
		pid: 1234,
		cwd: "/Users/alice/projects/app",
		tmuxTarget: "main:1.0",
		startTime: "2025-01-01T00:00:00Z",
		activity: "processing",
		lastSeen: "2025-01-01T00:01:00Z",
		lastEventTime: "2025-01-01T00:01:00Z",
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

describe("deriveClusterState", () => {
	const homedir = "/Users/alice";

	it("assigns pod to cluster when cwd matches directory", () => {
		const pods = new Map([
			[
				"lead-1",
				buildPod({ leadSessionId: "lead-1", memberSessionIds: ["lead-1"] }),
			],
		]);
		const sessions = new Map([
			[
				"lead-1",
				buildSession({ sessionId: "lead-1", cwd: "/Users/alice/projects/app" }),
			],
		]);
		const clusters = [buildCluster({ id: "c1", directories: ["~/projects"] })];

		const result = deriveClusterState(pods, sessions, clusters, {}, homedir);

		expect(result.clusters[0].podIds).toEqual(["lead-1"]);
		expect(result.unclustered.podIds).toEqual([]);
	});

	it("puts pod in unclustered when no directory matches", () => {
		const pods = new Map([["lead-1", buildPod({ leadSessionId: "lead-1" })]]);
		const sessions = new Map([
			["lead-1", buildSession({ sessionId: "lead-1", cwd: "/tmp/scratch" })],
		]);
		const clusters = [buildCluster({ id: "c1", directories: ["~/projects"] })];

		const result = deriveClusterState(pods, sessions, clusters, {}, homedir);

		expect(result.clusters[0].podIds).toEqual([]);
		expect(result.unclustered.podIds).toEqual(["lead-1"]);
	});

	it("puts pod in unclustered when lead session is missing", () => {
		const pods = new Map([["lead-1", buildPod({ leadSessionId: "lead-1" })]]);
		const sessions = new Map<string, RegisteredSession>();
		const clusters = [buildCluster({ id: "c1", directories: ["~/projects"] })];

		const result = deriveClusterState(pods, sessions, clusters, {}, homedir);

		expect(result.clusters[0].podIds).toEqual([]);
		expect(result.unclustered.podIds).toEqual(["lead-1"]);
	});

	it("manual assignment overrides directory match", () => {
		const pods = new Map([["lead-1", buildPod({ leadSessionId: "lead-1" })]]);
		const sessions = new Map([
			[
				"lead-1",
				buildSession({ sessionId: "lead-1", cwd: "/Users/alice/projects/app" }),
			],
		]);
		const clusters = [
			buildCluster({ id: "c1", name: "Work", directories: ["~/projects"] }),
			buildCluster({
				id: "c2",
				name: "Personal",
				directories: ["~/personal"],
				sortOrder: 1,
			}),
		];
		const manualAssignments = { "lead-1": "c2" };

		const result = deriveClusterState(
			pods,
			sessions,
			clusters,
			manualAssignments,
			homedir,
		);

		expect(result.clusters[0].podIds).toEqual([]); // c1 gets nothing
		expect(result.clusters[1].podIds).toEqual(["lead-1"]); // c2 gets the pod
	});

	it("longest prefix wins with overlapping directories", () => {
		const pods = new Map([["lead-1", buildPod({ leadSessionId: "lead-1" })]]);
		const sessions = new Map([
			[
				"lead-1",
				buildSession({
					sessionId: "lead-1",
					cwd: "/Users/alice/projects/frontend/app",
				}),
			],
		]);
		const clusters = [
			buildCluster({ id: "broad", directories: ["~/projects"] }),
			buildCluster({
				id: "narrow",
				directories: ["~/projects/frontend"],
				sortOrder: 1,
			}),
		];

		const result = deriveClusterState(pods, sessions, clusters, {}, homedir);

		expect(result.clusters[0].podIds).toEqual([]); // broad cluster
		expect(result.clusters[1].podIds).toEqual(["lead-1"]); // narrow cluster wins
	});

	it("computes attention from session activity states", () => {
		const pods = new Map([
			[
				"lead-1",
				buildPod({
					leadSessionId: "lead-1",
					memberSessionIds: ["lead-1", "sub-1", "sub-2"],
				}),
			],
		]);
		const sessions = new Map([
			[
				"lead-1",
				buildSession({
					sessionId: "lead-1",
					cwd: "/Users/alice/projects/app",
					activity: "idle",
				}),
			],
			[
				"sub-1",
				buildSession({
					sessionId: "sub-1",
					cwd: "/Users/alice/projects/app",
					activity: "pending_approval",
				}),
			],
			[
				"sub-2",
				buildSession({
					sessionId: "sub-2",
					cwd: "/Users/alice/projects/app",
					activity: "processing",
				}),
			],
		]);
		const clusters = [buildCluster({ id: "c1", directories: ["~/projects"] })];

		const result = deriveClusterState(pods, sessions, clusters, {}, homedir);

		// idle + pending_approval are attention states; processing is not
		expect(result.clusters[0].attentionCount).toBe(2);
	});

	it("computes unclustered attention", () => {
		const pods = new Map([
			[
				"lead-1",
				buildPod({
					leadSessionId: "lead-1",
					memberSessionIds: ["lead-1"],
				}),
			],
		]);
		const sessions = new Map([
			[
				"lead-1",
				buildSession({
					sessionId: "lead-1",
					cwd: "/tmp/scratch",
					activity: "pending_approval",
				}),
			],
		]);
		const clusters = [buildCluster({ id: "c1", directories: ["~/projects"] })];

		const result = deriveClusterState(pods, sessions, clusters, {}, homedir);

		expect(result.unclustered.podIds).toEqual(["lead-1"]);
		expect(result.unclustered.attentionCount).toBe(1);
	});

	it("handles multiple pods across clusters", () => {
		const pods = new Map([
			["lead-1", buildPod({ leadSessionId: "lead-1" })],
			["lead-2", buildPod({ leadSessionId: "lead-2" })],
			["lead-3", buildPod({ leadSessionId: "lead-3" })],
		]);
		const sessions = new Map([
			[
				"lead-1",
				buildSession({ sessionId: "lead-1", cwd: "/Users/alice/projects/app" }),
			],
			[
				"lead-2",
				buildSession({
					sessionId: "lead-2",
					cwd: "/Users/alice/personal/blog",
				}),
			],
			["lead-3", buildSession({ sessionId: "lead-3", cwd: "/tmp/random" })],
		]);
		const clusters = [
			buildCluster({ id: "c1", name: "Work", directories: ["~/projects"] }),
			buildCluster({
				id: "c2",
				name: "Personal",
				directories: ["~/personal"],
				sortOrder: 1,
			}),
		];

		const result = deriveClusterState(pods, sessions, clusters, {}, homedir);

		expect(result.clusters[0].podIds).toEqual(["lead-1"]);
		expect(result.clusters[1].podIds).toEqual(["lead-2"]);
		expect(result.unclustered.podIds).toEqual(["lead-3"]);
	});

	it("ignores manual assignment pointing to deleted cluster", () => {
		const pods = new Map([["lead-1", buildPod({ leadSessionId: "lead-1" })]]);
		const sessions = new Map([
			[
				"lead-1",
				buildSession({ sessionId: "lead-1", cwd: "/Users/alice/projects/app" }),
			],
		]);
		const clusters = [buildCluster({ id: "c1", directories: ["~/projects"] })];
		// Manual assignment points to non-existent cluster
		const manualAssignments = { "lead-1": "deleted-cluster" };

		const result = deriveClusterState(
			pods,
			sessions,
			clusters,
			manualAssignments,
			homedir,
		);

		// Falls back to directory matching
		expect(result.clusters[0].podIds).toEqual(["lead-1"]);
	});

	it("returns empty results with no pods", () => {
		const pods = new Map<string, Pod>();
		const sessions = new Map<string, RegisteredSession>();
		const clusters = [buildCluster({ id: "c1" })];

		const result = deriveClusterState(pods, sessions, clusters, {}, homedir);

		expect(result.clusters[0].podIds).toEqual([]);
		expect(result.clusters[0].attentionCount).toBe(0);
		expect(result.unclustered.podIds).toEqual([]);
		expect(result.unclustered.attentionCount).toBe(0);
	});
});

describe("computePodAttention", () => {
	it("returns 0 when all members are working", () => {
		const pod = buildPod({ memberSessionIds: ["s1", "s2"] });
		const sessions = new Map([
			["s1", buildSession({ sessionId: "s1", activity: "processing" })],
			["s2", buildSession({ sessionId: "s2", activity: "running_tool" })],
		]);

		expect(computePodAttention(pod, sessions)).toBe(0);
	});

	it("counts idle sessions as attention", () => {
		const pod = buildPod({ memberSessionIds: ["s1", "s2"] });
		const sessions = new Map([
			["s1", buildSession({ sessionId: "s1", activity: "idle" })],
			["s2", buildSession({ sessionId: "s2", activity: "processing" })],
		]);

		expect(computePodAttention(pod, sessions)).toBe(1);
	});

	it("counts pending_approval as attention", () => {
		const pod = buildPod({ memberSessionIds: ["s1"] });
		const sessions = new Map([
			["s1", buildSession({ sessionId: "s1", activity: "pending_approval" })],
		]);

		expect(computePodAttention(pod, sessions)).toBe(1);
	});

	it("counts multiple attention states", () => {
		const pod = buildPod({ memberSessionIds: ["s1", "s2", "s3"] });
		const sessions = new Map([
			["s1", buildSession({ sessionId: "s1", activity: "idle" })],
			["s2", buildSession({ sessionId: "s2", activity: "pending_approval" })],
			["s3", buildSession({ sessionId: "s3", activity: "processing" })],
		]);

		expect(computePodAttention(pod, sessions)).toBe(2);
	});

	it("handles missing sessions gracefully", () => {
		const pod = buildPod({ memberSessionIds: ["s1", "missing"] });
		const sessions = new Map([
			["s1", buildSession({ sessionId: "s1", activity: "idle" })],
		]);

		expect(computePodAttention(pod, sessions)).toBe(1);
	});

	it("returns 0 for pod with no members in session store", () => {
		const pod = buildPod({ memberSessionIds: ["missing-1", "missing-2"] });
		const sessions = new Map<string, RegisteredSession>();

		expect(computePodAttention(pod, sessions)).toBe(0);
	});
});

describe("getClusterForPod", () => {
	const homedir = "/Users/alice";

	it("returns cluster when pod matches by directory", () => {
		const pods = new Map([["lead-1", buildPod({ leadSessionId: "lead-1" })]]);
		const sessions = new Map([
			[
				"lead-1",
				buildSession({ sessionId: "lead-1", cwd: "/Users/alice/projects/app" }),
			],
		]);
		const clusters = [buildCluster({ id: "c1", directories: ["~/projects"] })];

		const result = getClusterForPod(
			"lead-1",
			pods,
			sessions,
			clusters,
			{},
			homedir,
		);

		expect(result).toEqual(clusters[0]);
	});

	it("returns null when pod is unclustered", () => {
		const pods = new Map([["lead-1", buildPod({ leadSessionId: "lead-1" })]]);
		const sessions = new Map([
			["lead-1", buildSession({ sessionId: "lead-1", cwd: "/tmp/random" })],
		]);
		const clusters = [buildCluster({ id: "c1", directories: ["~/projects"] })];

		const result = getClusterForPod(
			"lead-1",
			pods,
			sessions,
			clusters,
			{},
			homedir,
		);

		expect(result).toBeNull();
	});

	it("returns null when pod doesn't exist", () => {
		const pods = new Map<string, Pod>();
		const sessions = new Map<string, RegisteredSession>();
		const clusters = [buildCluster({ id: "c1" })];

		const result = getClusterForPod(
			"nonexistent",
			pods,
			sessions,
			clusters,
			{},
			homedir,
		);

		expect(result).toBeNull();
	});

	it("returns null when lead session is missing", () => {
		const pods = new Map([["lead-1", buildPod({ leadSessionId: "lead-1" })]]);
		const sessions = new Map<string, RegisteredSession>();
		const clusters = [buildCluster({ id: "c1", directories: ["~/projects"] })];

		const result = getClusterForPod(
			"lead-1",
			pods,
			sessions,
			clusters,
			{},
			homedir,
		);

		expect(result).toBeNull();
	});

	it("respects manual assignment", () => {
		const pods = new Map([["lead-1", buildPod({ leadSessionId: "lead-1" })]]);
		const sessions = new Map([
			[
				"lead-1",
				buildSession({ sessionId: "lead-1", cwd: "/Users/alice/projects/app" }),
			],
		]);
		const clusters = [
			buildCluster({ id: "c1", directories: ["~/projects"] }),
			buildCluster({ id: "c2", name: "Other", directories: [], sortOrder: 1 }),
		];
		const manualAssignments = { "lead-1": "c2" };

		const result = getClusterForPod(
			"lead-1",
			pods,
			sessions,
			clusters,
			manualAssignments,
			homedir,
		);

		expect(result?.id).toBe("c2");
	});
});
