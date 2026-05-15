import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestHarness, MockSession, type TestHarness } from "./helpers/index.js";

describe("Smoke 4: Attention System", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createTestHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("session in pending_approval triggers attention on pod", async () => {
    const session = new MockSession(harness.baseUrl, {
      agentName: "worker",
    });
    await session.register();

    // Transition to pending_approval (tool needs user approval)
    await session.heartbeat("pending_approval");

    const podsRes = await fetch(`${harness.baseUrl}/api/pods`);
    const podsBody = await podsRes.json();
    expect(podsBody.pods[0].state).toBe("pending_approval");
    expect(podsBody.pods[0].attentionCount).toBe(1);
  });

  it("cluster attention badge sums pod attention counts", async () => {
    // Create a cluster
    const clusterRes = await fetch(`${harness.baseUrl}/api/clusters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Work",
        directories: ["/Users/test/work/"],
      }),
    });
    const cluster = await clusterRes.json();

    // Register two sessions in the cluster directory
    const session1 = new MockSession(harness.baseUrl, {
      cwd: "/Users/test/work/project-a/",
      agentName: "agent-1",
    });
    await session1.register();

    const session2 = new MockSession(harness.baseUrl, {
      cwd: "/Users/test/work/project-b/",
      agentName: "agent-2",
    });
    await session2.register();

    // Both need attention
    await session1.heartbeat("pending_approval");
    await session2.heartbeat("idle");

    // Check cluster attention count
    const clustersRes = await fetch(`${harness.baseUrl}/api/clusters`);
    const clustersBody = await clustersRes.json();

    const workCluster = clustersBody.clusters.find(
      (c: { id: string }) => c.id === cluster.id,
    );
    expect(workCluster.attentionCount).toBe(2);
  });

  it("approving tool (state change to processing) clears attention", async () => {
    const session = new MockSession(harness.baseUrl, {
      agentName: "worker",
    });
    await session.register();

    // Enter attention state
    await session.heartbeat("pending_approval");

    let podsRes = await fetch(`${harness.baseUrl}/api/pods`);
    let podsBody = await podsRes.json();
    expect(podsBody.pods[0].attentionCount).toBe(1);

    // Approve: transitions to processing
    await session.heartbeat("processing");

    podsRes = await fetch(`${harness.baseUrl}/api/pods`);
    podsBody = await podsRes.json();
    expect(podsBody.pods[0].state).toBe("processing");
    expect(podsBody.pods[0].attentionCount).toBe(0);
  });

  it("SSE delivers attention state changes for notification panel", async () => {
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

    const session = new MockSession(harness.baseUrl, {
      agentName: "attention-test",
    });
    await session.register();
    await session.heartbeat("pending_approval");

    await new Promise((resolve) => setTimeout(resolve, 100));
    controller.abort();
    await ssePromise;

    // Should have session:updated with pending_approval state
    const updateEvent = events.find(
      (e) =>
        e.type === "session:updated" &&
        (e.data as { activity: string }).activity === "pending_approval",
    );
    expect(updateEvent).toBeDefined();
  });

  it("multiple sessions: only attention-needing ones counted", async () => {
    // Register 3 sessions
    const sessions = await Promise.all(
      [1, 2, 3].map(async (i) => {
        const session = new MockSession(harness.baseUrl, {
          agentName: `agent-${i}`,
          cwd: "/Users/test/work/",
        });
        await session.register();
        return session;
      }),
    );

    // Only session 2 needs approval
    await sessions[0].heartbeat("processing");
    await sessions[1].heartbeat("pending_approval");
    await sessions[2].heartbeat("running_tool");

    const podsRes = await fetch(`${harness.baseUrl}/api/pods`);
    const podsBody = await podsRes.json();

    const attentionPods = podsBody.pods.filter(
      (pod: { attentionCount: number }) => pod.attentionCount > 0,
    );
    expect(attentionPods).toHaveLength(1);
    expect(attentionPods[0].leadSessionId).toBe(sessions[1].sessionId);
  });

  it("pod-level attention aggregates member states", async () => {
    // Parent with two children in a pod
    const parent = new MockSession(harness.baseUrl, {
      agentName: "orchestrator",
    });
    await parent.register();

    const child1 = new MockSession(harness.baseUrl, { subagentId: "sub-1" });
    await child1.register();

    const child2 = new MockSession(harness.baseUrl, { subagentId: "sub-2" });
    await child2.register();

    await fetch(`${harness.baseUrl}/api/pods/ownership`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentSessionId: parent.sessionId,
        subagentIds: ["sub-1", "sub-2"],
      }),
    });

    // Parent processing, child1 idle, child2 pending_approval
    await parent.heartbeat("processing");
    await child1.heartbeat("idle");
    await child2.heartbeat("pending_approval");

    const podsRes = await fetch(`${harness.baseUrl}/api/pods`);
    const podsBody = await podsRes.json();

    // Pod attention count = 2 (child1 idle + child2 pending_approval)
    expect(podsBody.pods[0].attentionCount).toBe(2);
    // Pod state = worst = pending_approval
    expect(podsBody.pods[0].state).toBe("pending_approval");
  });
});
