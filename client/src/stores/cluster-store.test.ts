import { describe, it, expect, beforeEach } from "vitest";
import { useClusterStore } from "./cluster-store";
import type { ClusterDefinition } from "@pi-fleet/shared";

describe("cluster-store", () => {
	beforeEach(() => {
		useClusterStore.setState({
			clusters: [],
			unclustered: { podIds: [], attentionCount: 0 },
			loading: false,
		});
	});

	describe("setClusters", () => {
		it("sets clusters and unclustered state", () => {
			const clusters = [
				{
					id: "c1",
					name: "Work",
					directories: ["~/work/"],
					sortOrder: 0,
					podIds: ["pod-1"],
					attentionCount: 1,
				},
			];
			const unclustered = { podIds: ["pod-2"], attentionCount: 0 };

			useClusterStore.getState().setClusters(clusters, unclustered);

			const state = useClusterStore.getState();
			expect(state.clusters).toEqual(clusters);
			expect(state.unclustered).toEqual(unclustered);
			expect(state.loading).toBe(false);
		});
	});

	describe("addCluster", () => {
		it("adds a new cluster with empty podIds", () => {
			const cluster: ClusterDefinition = {
				id: "c1",
				name: "Work",
				directories: ["~/work/"],
				sortOrder: 0,
			};

			useClusterStore.getState().addCluster(cluster);

			const state = useClusterStore.getState();
			expect(state.clusters).toHaveLength(1);
			expect(state.clusters[0]).toEqual({
				...cluster,
				podIds: [],
				attentionCount: 0,
			});
		});
	});

	describe("updateCluster", () => {
		it("updates an existing cluster by id", () => {
			useClusterStore.setState({
				clusters: [
					{
						id: "c1",
						name: "Old",
						directories: [],
						sortOrder: 0,
						podIds: ["pod-1"],
						attentionCount: 1,
					},
				],
				unclustered: { podIds: [], attentionCount: 0 },
				loading: false,
			});

			const updated: ClusterDefinition = {
				id: "c1",
				name: "New",
				directories: ["~/new/"],
				sortOrder: 0,
			};

			useClusterStore.getState().updateCluster(updated);

			const state = useClusterStore.getState();
			expect(state.clusters[0].name).toBe("New");
			expect(state.clusters[0].directories).toEqual(["~/new/"]);
			// Preserves podIds from existing state
			expect(state.clusters[0].podIds).toEqual(["pod-1"]);
		});

		it("does nothing if cluster not found", () => {
			useClusterStore.setState({
				clusters: [
					{
						id: "c1",
						name: "Work",
						directories: [],
						sortOrder: 0,
						podIds: [],
						attentionCount: 0,
					},
				],
				unclustered: { podIds: [], attentionCount: 0 },
				loading: false,
			});

			const updated: ClusterDefinition = {
				id: "nonexistent",
				name: "Nope",
				directories: [],
				sortOrder: 0,
			};

			useClusterStore.getState().updateCluster(updated);

			const state = useClusterStore.getState();
			expect(state.clusters).toHaveLength(1);
			expect(state.clusters[0].name).toBe("Work");
		});
	});

	describe("removeCluster", () => {
		it("removes cluster and moves pods to unclustered", () => {
			useClusterStore.setState({
				clusters: [
					{
						id: "c1",
						name: "Work",
						directories: [],
						sortOrder: 0,
						podIds: ["pod-1", "pod-2"],
						attentionCount: 2,
					},
					{
						id: "c2",
						name: "Personal",
						directories: [],
						sortOrder: 1,
						podIds: ["pod-3"],
						attentionCount: 0,
					},
				],
				unclustered: { podIds: ["pod-4"], attentionCount: 1 },
				loading: false,
			});

			useClusterStore.getState().removeCluster("c1");

			const state = useClusterStore.getState();
			expect(state.clusters).toHaveLength(1);
			expect(state.clusters[0].id).toBe("c2");
			expect(state.unclustered.podIds).toEqual(["pod-4", "pod-1", "pod-2"]);
			expect(state.unclustered.attentionCount).toBe(3);
		});
	});

	describe("reorderClusters", () => {
		it("reorders clusters and updates sortOrder", () => {
			useClusterStore.setState({
				clusters: [
					{
						id: "c1",
						name: "First",
						directories: [],
						sortOrder: 0,
						podIds: [],
						attentionCount: 0,
					},
					{
						id: "c2",
						name: "Second",
						directories: [],
						sortOrder: 1,
						podIds: [],
						attentionCount: 0,
					},
					{
						id: "c3",
						name: "Third",
						directories: [],
						sortOrder: 2,
						podIds: [],
						attentionCount: 0,
					},
				],
				unclustered: { podIds: [], attentionCount: 0 },
				loading: false,
			});

			useClusterStore.getState().reorderClusters(["c3", "c1", "c2"]);

			const state = useClusterStore.getState();
			expect(state.clusters[0].id).toBe("c3");
			expect(state.clusters[0].sortOrder).toBe(0);
			expect(state.clusters[1].id).toBe("c1");
			expect(state.clusters[1].sortOrder).toBe(1);
			expect(state.clusters[2].id).toBe("c2");
			expect(state.clusters[2].sortOrder).toBe(2);
		});
	});
});
