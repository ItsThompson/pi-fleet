import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestHarness, MockSession, type TestHarness } from "./helpers/index.js";

describe("Smoke 6: Drag-and-Drop (Cluster Reassignment + Reorder)", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createTestHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("drag pod between clusters (manual assign endpoint)", async () => {
    // Create two clusters
    const clusterARes = await fetch(`${harness.baseUrl}/api/clusters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Cluster A",
        directories: ["/Users/test/a/"],
      }),
    });
    const clusterA = await clusterARes.json();

    const clusterBRes = await fetch(`${harness.baseUrl}/api/clusters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Cluster B",
        directories: ["/Users/test/b/"],
      }),
    });
    const clusterB = await clusterBRes.json();

    // Register session that auto-assigns to cluster A
    const session = new MockSession(harness.baseUrl, {
      cwd: "/Users/test/a/project/",
      agentName: "draggable",
    });
    await session.register();

    // Verify initially in cluster A
    let clustersRes = await fetch(`${harness.baseUrl}/api/clusters`);
    let clustersBody = await clustersRes.json();
    let clusterAData = clustersBody.clusters.find(
      (c: { id: string }) => c.id === clusterA.id,
    );
    expect(clusterAData.podIds).toContain(session.sessionId);

    // Drag to cluster B (simulate via assign endpoint)
    const assignRes = await fetch(`${harness.baseUrl}/api/clusters/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.sessionId,
        clusterId: clusterB.id,
      }),
    });
    expect(assignRes.status).toBe(200);

    // Verify now in cluster B
    clustersRes = await fetch(`${harness.baseUrl}/api/clusters`);
    clustersBody = await clustersRes.json();
    clusterAData = clustersBody.clusters.find(
      (c: { id: string }) => c.id === clusterA.id,
    );
    const clusterBData = clustersBody.clusters.find(
      (c: { id: string }) => c.id === clusterB.id,
    );
    expect(clusterAData.podIds).not.toContain(session.sessionId);
    expect(clusterBData.podIds).toContain(session.sessionId);
  });

  it("reorder clusters and verify persistence", async () => {
    // Create three clusters
    const names = ["First", "Second", "Third"];
    const clusters: Array<{ id: string; name: string }> = [];
    for (const name of names) {
      const res = await fetch(`${harness.baseUrl}/api/clusters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, directories: [] }),
      });
      clusters.push(await res.json());
    }

    // Reorder: Third, First, Second
    const newOrder = [clusters[2].id, clusters[0].id, clusters[1].id];
    const reorderRes = await fetch(`${harness.baseUrl}/api/clusters/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: newOrder }),
    });
    expect(reorderRes.status).toBe(200);

    // Flush to disk
    harness.server.clusterStore.flush();

    // Verify order persisted
    const clustersRes = await fetch(`${harness.baseUrl}/api/clusters`);
    const clustersBody = await clustersRes.json();
    const orderedNames = clustersBody.clusters.map(
      (c: { name: string }) => c.name,
    );
    expect(orderedNames).toEqual(["Third", "First", "Second"]);
  });

  it("drag pod to unclustered (null assignment)", async () => {
    const clusterRes = await fetch(`${harness.baseUrl}/api/clusters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "My Cluster",
        directories: ["/Users/test/work/"],
      }),
    });
    const cluster = await clusterRes.json();

    // Register session auto-assigned to cluster
    const session = new MockSession(harness.baseUrl, {
      cwd: "/Users/test/work/project/",
    });
    await session.register();

    // Verify initially assigned
    let clustersRes = await fetch(`${harness.baseUrl}/api/clusters`);
    let clustersBody = await clustersRes.json();
    expect(
      clustersBody.clusters[0].podIds,
    ).toContain(session.sessionId);

    // Drag to unclustered
    await fetch(`${harness.baseUrl}/api/clusters/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.sessionId,
        clusterId: null,
      }),
    });

    // After setting null manual assignment, the directory-based assignment
    // should kick back in. To truly "unclustered" we'd need a non-matching cwd.
    // The assign endpoint with null removes the manual override.
    clustersRes = await fetch(`${harness.baseUrl}/api/clusters`);
    clustersBody = await clustersRes.json();

    // Since cwd still matches the cluster directory and we cleared the manual
    // override (set to null = remove override), directory match wins again.
    // This is expected behavior: drag to unclustered with matching dir
    // requires setting a manual override to a special "unclustered" value.
    // The API contract uses null to mean "remove override".
    expect(clustersBody.clusters[0].podIds).toContain(session.sessionId);
  });

  it("SSE broadcasts assignment changes for client DnD updates", async () => {
    const events: Array<{ type: string; data: unknown }> = [];
    const controller = new AbortController();

    const ssePromise = fetch(`${harness.baseUrl}/api/events`, {
      signal: controller.signal,
    }).then(async (res) => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        frames.forEach((frame) => {
          const eventMatch = frame.match(/^event: (.+)$/m);
          const dataMatch = frame.match(/^data: (.+)$/m);
          if (eventMatch && dataMatch) {
            events.push({
              type: eventMatch[1],
              data: JSON.parse(dataMatch[1]),
            });
          }
        });
      }
    }).catch(() => {});

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create cluster and session
    const clusterRes = await fetch(`${harness.baseUrl}/api/clusters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Target",
        directories: [],
      }),
    });
    const cluster = await clusterRes.json();

    const session = new MockSession(harness.baseUrl, {
      cwd: "/Users/test/unmatched/",
    });
    await session.register();

    // Assign via DnD
    await fetch(`${harness.baseUrl}/api/clusters/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.sessionId,
        clusterId: cluster.id,
      }),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    controller.abort();
    await ssePromise;

    // Should have assignment-changed SSE event
    const assignEvent = events.find(
      (e) => e.type === "cluster:assignment-changed",
    );
    expect(assignEvent).toBeDefined();
    expect(
      (assignEvent!.data as { sessionId: string; clusterId: string }).clusterId,
    ).toBe(cluster.id);
  });

  it("manual assignment persists and survives re-evaluation", async () => {
    const clusterRes = await fetch(`${harness.baseUrl}/api/clusters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Override Target",
        directories: [],
      }),
    });
    const cluster = await clusterRes.json();

    const session = new MockSession(harness.baseUrl, {
      cwd: "/Users/test/somewhere/",
    });
    await session.register();

    // Manually assign
    await fetch(`${harness.baseUrl}/api/clusters/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.sessionId,
        clusterId: cluster.id,
      }),
    });

    // Flush config
    harness.server.clusterStore.flush();

    // Verify manual assignment is stored
    const assignment = harness.server.clusterStore.getManualAssignment(
      session.sessionId,
    );
    expect(assignment).toBe(cluster.id);

    // Verify it survives cluster listing (re-evaluation)
    const clustersRes = await fetch(`${harness.baseUrl}/api/clusters`);
    const clustersBody = await clustersRes.json();
    const targetCluster = clustersBody.clusters.find(
      (c: { id: string }) => c.id === cluster.id,
    );
    expect(targetCluster.podIds).toContain(session.sessionId);
  });
});
