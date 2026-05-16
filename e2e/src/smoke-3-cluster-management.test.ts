import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	createTestHarness,
	MockSession,
	type TestHarness,
} from "./helpers/index.js";

describe("Smoke 3: Cluster Management", () => {
	let harness: TestHarness;

	beforeEach(async () => {
		harness = await createTestHarness();
	});

	afterEach(async () => {
		await harness.cleanup();
	});

	it("creates a cluster with a directory binding", async () => {
		const createRes = await fetch(`${harness.baseUrl}/api/clusters`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Work",
				directories: ["/Users/test/workplace/"],
			}),
		});
		expect(createRes.status).toBe(201);
		const cluster = await createRes.json();
		expect(cluster.name).toBe("Work");
		expect(cluster.directories).toEqual(["/Users/test/workplace/"]);
		expect(cluster.id).toBeDefined();
	});

	it("session auto-assigns to cluster based on directory match", async () => {
		// Create cluster
		const createRes = await fetch(`${harness.baseUrl}/api/clusters`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Work",
				directories: ["/Users/test/workplace/"],
			}),
		});
		const cluster = await createRes.json();

		// Register session in matching directory
		const session = new MockSession(harness.baseUrl, {
			cwd: "/Users/test/workplace/my-project/",
		});
		await session.register();

		// Check cluster listing shows session assigned
		const clustersRes = await fetch(`${harness.baseUrl}/api/clusters`);
		const clustersBody = await clustersRes.json();

		const workCluster = clustersBody.clusters.find(
			(c: { id: string }) => c.id === cluster.id,
		);
		expect(workCluster.podIds).toContain(session.sessionId);
		expect(clustersBody.unclustered.podIds).not.toContain(session.sessionId);
	});

	it("manual reassignment via drag (assign endpoint) overrides directory", async () => {
		// Create two clusters
		const cluster1Res = await fetch(`${harness.baseUrl}/api/clusters`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Work",
				directories: ["/Users/test/workplace/"],
			}),
		});
		const cluster1 = await cluster1Res.json();

		const cluster2Res = await fetch(`${harness.baseUrl}/api/clusters`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Personal", directories: [] }),
		});
		const cluster2 = await cluster2Res.json();

		// Register session matching cluster1
		const session = new MockSession(harness.baseUrl, {
			cwd: "/Users/test/workplace/project-a/",
		});
		await session.register();

		// Drag to unclustered (null clusterId = remove manual assignment to fallback)
		const assignRes = await fetch(`${harness.baseUrl}/api/clusters/assign`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: session.sessionId,
				clusterId: cluster2.id,
			}),
		});
		expect(assignRes.status).toBe(200);

		// Now should appear in cluster2 despite directory matching cluster1
		const clustersRes = await fetch(`${harness.baseUrl}/api/clusters`);
		const clustersBody = await clustersRes.json();

		const personalCluster = clustersBody.clusters.find(
			(c: { id: string }) => c.id === cluster2.id,
		);
		expect(personalCluster.podIds).toContain(session.sessionId);
	});

	it("cluster persists across server restarts (config file)", async () => {
		// Create cluster
		await fetch(`${harness.baseUrl}/api/clusters`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Persistent", directories: ["/tmp/"] }),
		});

		// Flush to ensure persistence
		harness.server.clusterStore.flush();

		// Verify by reading config directly
		const config = harness.server.clusterStore.getConfig();
		expect(config.clusters).toHaveLength(1);
		expect(config.clusters[0].name).toBe("Persistent");
	});

	it("deletes a cluster and pods move to unclustered", async () => {
		const createRes = await fetch(`${harness.baseUrl}/api/clusters`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Doomed",
				directories: ["/Users/test/doomed/"],
			}),
		});
		const cluster = await createRes.json();

		// Register session in this cluster
		const session = new MockSession(harness.baseUrl, {
			cwd: "/Users/test/doomed/project/",
		});
		await session.register();

		// Delete the cluster
		const deleteRes = await fetch(
			`${harness.baseUrl}/api/clusters/${cluster.id}`,
			{ method: "DELETE" },
		);
		expect(deleteRes.status).toBe(200);

		// Session should now be unclustered
		const clustersRes = await fetch(`${harness.baseUrl}/api/clusters`);
		const clustersBody = await clustersRes.json();
		expect(clustersBody.clusters).toHaveLength(0);
		expect(clustersBody.unclustered.podIds).toContain(session.sessionId);
	});

	it("reorder clusters persists new sort order", async () => {
		// Create three clusters
		const ids: string[] = [];
		for (const name of ["Alpha", "Beta", "Gamma"]) {
			const res = await fetch(`${harness.baseUrl}/api/clusters`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, directories: [] }),
			});
			const cluster = await res.json();
			ids.push(cluster.id);
		}

		// Reorder: Gamma, Alpha, Beta
		const reorderRes = await fetch(`${harness.baseUrl}/api/clusters/reorder`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ orderedIds: [ids[2], ids[0], ids[1]] }),
		});
		expect(reorderRes.status).toBe(200);

		// Verify new order
		const clustersRes = await fetch(`${harness.baseUrl}/api/clusters`);
		const clustersBody = await clustersRes.json();
		const names = clustersBody.clusters.map((c: { name: string }) => c.name);
		expect(names).toEqual(["Gamma", "Alpha", "Beta"]);
	});

	it("session with no cluster match appears in unclustered", async () => {
		// Create a cluster that won't match
		await fetch(`${harness.baseUrl}/api/clusters`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Work",
				directories: ["/Users/test/workplace/"],
			}),
		});

		// Register session in a non-matching directory
		const session = new MockSession(harness.baseUrl, {
			cwd: "/Users/test/personal/blog/",
		});
		await session.register();

		const clustersRes = await fetch(`${harness.baseUrl}/api/clusters`);
		const clustersBody = await clustersRes.json();
		expect(clustersBody.unclustered.podIds).toContain(session.sessionId);
	});
});
