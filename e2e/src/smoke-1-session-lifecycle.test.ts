import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestHarness, MockSession, type TestHarness } from "./helpers/index.js";

describe("Smoke 1: Session Lifecycle", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createTestHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("registers a session and it appears in the session list", async () => {
    const session = new MockSession(harness.baseUrl, {
      agentName: "test-agent",
      model: "Claude Sonnet 4",
      cwd: "/Users/test/project",
      tmuxTarget: "main:1.0",
    });

    const registerRes = await session.register();
    expect(registerRes.status).toBe(201);

    // Verify session appears in listing
    const listRes = await fetch(`${harness.baseUrl}/api/sessions`);
    const listBody = await listRes.json();
    expect(listBody.sessions).toHaveLength(1);
    expect(listBody.sessions[0].sessionId).toBe(session.sessionId);
    expect(listBody.sessions[0].model).toBe("Claude Sonnet 4");
    expect(listBody.sessions[0].agentName).toBe("test-agent");
  });

  it("heartbeat updates session activity and metadata", async () => {
    const session = new MockSession(harness.baseUrl, {
      model: "Claude Sonnet 4",
    });
    await session.register();

    // Send heartbeat with updated data
    const heartbeatRes = await session.heartbeat("running_tool", {
      turnCount: 5,
      contextUsage: { tokens: 5000, contextWindow: 200000, percent: 3 },
      model: "Claude Sonnet 4",
    });
    expect(heartbeatRes.status).toBe(200);

    // Verify session data updated
    const listRes = await fetch(`${harness.baseUrl}/api/sessions`);
    const listBody = await listRes.json();
    const updated = listBody.sessions[0];
    expect(updated.activity).toBe("running_tool");
    expect(updated.turnCount).toBe(5);
    expect(updated.contextUsage.percent).toBe(3);
  });

  it("session appears in pod listing as a single-member pod", async () => {
    const session = new MockSession(harness.baseUrl, {
      agentName: "my-project",
    });
    await session.register();

    const podsRes = await fetch(`${harness.baseUrl}/api/pods`);
    const podsBody = await podsRes.json();
    expect(podsBody.pods).toHaveLength(1);
    expect(podsBody.pods[0].leadSessionId).toBe(session.sessionId);
    expect(podsBody.pods[0].displayName).toBe("my-project");
    expect(podsBody.pods[0].memberSessionIds).toEqual([session.sessionId]);
  });

  it("unregistering removes session from listings", async () => {
    const session = new MockSession(harness.baseUrl);
    await session.register();

    const unregRes = await session.unregister();
    expect(unregRes.status).toBe(200);

    const listRes = await fetch(`${harness.baseUrl}/api/sessions`);
    const listBody = await listRes.json();
    expect(listBody.sessions).toHaveLength(0);

    const podsRes = await fetch(`${harness.baseUrl}/api/pods`);
    const podsBody = await podsRes.json();
    expect(podsBody.pods).toHaveLength(0);
  });

  it("session card data includes model, context%, and turns", async () => {
    const session = new MockSession(harness.baseUrl, {
      model: "Claude Sonnet 4",
    });
    await session.register();

    await session.heartbeat("processing", {
      turnCount: 12,
      contextUsage: { tokens: 50000, contextWindow: 200000, percent: 25 },
      thinkingLevel: "high",
    });

    const listRes = await fetch(`${harness.baseUrl}/api/sessions`);
    const listBody = await listRes.json();
    const sessionData = listBody.sessions[0];

    expect(sessionData.model).toBe("Claude Sonnet 4");
    expect(sessionData.contextUsage.percent).toBe(25);
    expect(sessionData.turnCount).toBe(12);
    expect(sessionData.thinkingLevel).toBe("high");
  });

  it("open-terminal endpoint resolves session tmux target", async () => {
    const session = new MockSession(harness.baseUrl, {
      tmuxTarget: "dev:2.1",
    });
    await session.register();

    const openRes = await fetch(`${harness.baseUrl}/api/open-terminal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.sessionId }),
    });
    expect(openRes.status).toBe(200);
    const openBody = await openRes.json();
    expect(openBody.tmuxTarget).toBe("dev:2.1");
  });

  it("SSE stream delivers session events in real-time", async () => {
    // Connect to SSE before registering
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

        // Parse SSE frames
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
    }).catch(() => {
      // Expected: abort
    });

    // Wait for connection
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Register a session
    const session = new MockSession(harness.baseUrl, {
      agentName: "sse-test",
    });
    await session.register();

    // Wait for event delivery
    await new Promise((resolve) => setTimeout(resolve, 100));

    controller.abort();
    await ssePromise;

    // Should have received connected + session:added
    const sessionAdded = events.find((e) => e.type === "session:added");
    expect(sessionAdded).toBeDefined();
    expect((sessionAdded!.data as { agentName: string }).agentName).toBe("sse-test");
  });
});
