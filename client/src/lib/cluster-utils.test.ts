import { describe, it, expect } from "vitest";
import { computeUnclusteredPodIds } from "./cluster-utils";
import type { Pod } from "@pi-fleet/shared";

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

describe("computeUnclusteredPodIds", () => {
	it("returns empty set when all pods are assigned to clusters", () => {
		const allPods = [
			buildPod({ leadSessionId: "pod-a" }),
			buildPod({ leadSessionId: "pod-b" }),
		];
		const clusterData = {
			clusteredPodIds: [["pod-a"], ["pod-b"]],
			unclusteredPodIds: [],
		};

		const result = computeUnclusteredPodIds(allPods, clusterData);

		expect(result.size).toBe(0);
	});

	it("returns empty set when all pods are in the unclustered list", () => {
		const allPods = [
			buildPod({ leadSessionId: "pod-a" }),
			buildPod({ leadSessionId: "pod-b" }),
		];
		const clusterData = {
			clusteredPodIds: [],
			unclusteredPodIds: ["pod-a", "pod-b"],
		};

		const result = computeUnclusteredPodIds(allPods, clusterData);

		expect(result).toEqual(new Set(["pod-a", "pod-b"]));
	});

	it("detects orphans not in any cluster or unclustered list", () => {
		const allPods = [
			buildPod({ leadSessionId: "pod-a" }),
			buildPod({ leadSessionId: "pod-b" }),
			buildPod({ leadSessionId: "pod-orphan" }),
		];
		const clusterData = {
			clusteredPodIds: [["pod-a"]],
			unclusteredPodIds: ["pod-b"],
		};

		const result = computeUnclusteredPodIds(allPods, clusterData);

		expect(result).toEqual(new Set(["pod-b", "pod-orphan"]));
	});

	it("includes both unclustered pods and orphans together", () => {
		const allPods = [
			buildPod({ leadSessionId: "assigned-1" }),
			buildPod({ leadSessionId: "unclustered-1" }),
			buildPod({ leadSessionId: "orphan-1" }),
			buildPod({ leadSessionId: "orphan-2" }),
		];
		const clusterData = {
			clusteredPodIds: [["assigned-1"]],
			unclusteredPodIds: ["unclustered-1"],
		};

		const result = computeUnclusteredPodIds(allPods, clusterData);

		expect(result).toEqual(new Set(["unclustered-1", "orphan-1", "orphan-2"]));
	});

	it("handles empty clusters list", () => {
		const allPods = [
			buildPod({ leadSessionId: "pod-a" }),
			buildPod({ leadSessionId: "pod-b" }),
		];
		const clusterData = {
			clusteredPodIds: [],
			unclusteredPodIds: [],
		};

		const result = computeUnclusteredPodIds(allPods, clusterData);

		expect(result).toEqual(new Set(["pod-a", "pod-b"]));
	});

	it("handles empty pods list", () => {
		const clusterData = {
			clusteredPodIds: [["pod-a"]],
			unclusteredPodIds: ["pod-b"],
		};

		const result = computeUnclusteredPodIds([], clusterData);

		// Still returns unclustered pods even with no allPods
		expect(result).toEqual(new Set(["pod-b"]));
	});

	it("handles pods spread across multiple clusters", () => {
		const allPods = [
			buildPod({ leadSessionId: "pod-1" }),
			buildPod({ leadSessionId: "pod-2" }),
			buildPod({ leadSessionId: "pod-3" }),
			buildPod({ leadSessionId: "pod-4" }),
		];
		const clusterData = {
			clusteredPodIds: [["pod-1", "pod-2"], ["pod-3"]],
			unclusteredPodIds: [],
		};

		const result = computeUnclusteredPodIds(allPods, clusterData);

		// Only pod-4 is orphaned
		expect(result).toEqual(new Set(["pod-4"]));
	});
});
