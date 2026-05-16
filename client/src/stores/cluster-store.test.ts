import { describe, it, expect, beforeEach } from "vitest";
import { useClusterStore } from "./cluster-store";
import type { ClusterDefinition } from "@pi-fleet/shared";

describe("cluster-store", () => {
	beforeEach(() => {
		useClusterStore.setState({
			clusters: [],
			manualAssignments: {},
			loading: false,
		});
	});

	describe("setClusters", () => {
		it("sets clusters and manual assignments", () => {
			const clusters: ClusterDefinition[] = [
				{
					id: "c1",
					name: "Work",
					directories: ["~/work/"],
					sortOrder: 0,
				},
			];
			const manualAssignments = { "session-1": "c1" };

			useClusterStore.getState().setClusters(clusters, manualAssignments);

			const state = useClusterStore.getState();
			expect(state.clusters).toEqual(clusters);
			expect(state.manualAssignments).toEqual(manualAssignments);
			expect(state.loading).toBe(false);
		});
	});

	describe("addCluster", () => {
		it("adds a new cluster definition", () => {
			const cluster: ClusterDefinition = {
				id: "c1",
				name: "Work",
				directories: ["~/work/"],
				sortOrder: 0,
			};

			useClusterStore.getState().addCluster(cluster);

			const state = useClusterStore.getState();
			expect(state.clusters).toHaveLength(1);
			expect(state.clusters[0]).toEqual(cluster);
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
					},
				],
				manualAssignments: {},
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
		});

		it("does nothing if cluster not found", () => {
			useClusterStore.setState({
				clusters: [
					{
						id: "c1",
						name: "Work",
						directories: [],
						sortOrder: 0,
					},
				],
				manualAssignments: {},
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
		it("removes cluster from list", () => {
			useClusterStore.setState({
				clusters: [
					{
						id: "c1",
						name: "Work",
						directories: [],
						sortOrder: 0,
					},
					{
						id: "c2",
						name: "Personal",
						directories: [],
						sortOrder: 1,
					},
				],
				manualAssignments: {},
				loading: false,
			});

			useClusterStore.getState().removeCluster("c1");

			const state = useClusterStore.getState();
			expect(state.clusters).toHaveLength(1);
			expect(state.clusters[0].id).toBe("c2");
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
					},
					{
						id: "c2",
						name: "Second",
						directories: [],
						sortOrder: 1,
					},
					{
						id: "c3",
						name: "Third",
						directories: [],
						sortOrder: 2,
					},
				],
				manualAssignments: {},
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

	describe("setManualAssignment", () => {
		it("sets a manual assignment", () => {
			useClusterStore.getState().setManualAssignment("session-1", "c1");

			const state = useClusterStore.getState();
			expect(state.manualAssignments).toEqual({ "session-1": "c1" });
		});

		it("removes assignment when clusterId is null", () => {
			useClusterStore.setState({
				clusters: [],
				manualAssignments: { "session-1": "c1" },
				loading: false,
			});

			useClusterStore.getState().setManualAssignment("session-1", null);

			const state = useClusterStore.getState();
			expect(state.manualAssignments).toEqual({});
		});

		it("overwrites existing assignment", () => {
			useClusterStore.setState({
				clusters: [],
				manualAssignments: { "session-1": "c1" },
				loading: false,
			});

			useClusterStore.getState().setManualAssignment("session-1", "c2");

			const state = useClusterStore.getState();
			expect(state.manualAssignments).toEqual({ "session-1": "c2" });
		});
	});
});
