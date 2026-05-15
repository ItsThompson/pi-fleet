import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPodReporter, type PodReporterEventBus } from "./pod-reporter.js";

/**
 * Mock event bus that records emissions and allows manual triggering.
 */
function createMockEventBus(): PodReporterEventBus & {
  trigger(event: string, data?: unknown): void;
  emitted: Array<{ event: string; data?: unknown }>;
} {
  const handlers = new Map<string, Array<(data?: unknown) => void>>();
  const emitted: Array<{ event: string; data?: unknown }> = [];

  return {
    on(event: string, handler: (data?: unknown) => void) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    emit(event: string, data?: unknown) {
      emitted.push({ event, data });
    },
    trigger(event: string, data?: unknown) {
      const list = handlers.get(event) ?? [];
      list.forEach((handler) => handler(data));
    },
    emitted,
  };
}

describe("PodReporter", () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let mockFetch: ReturnType<typeof vi.fn>;
  const sessionId = "parent-session-123";

  beforeEach(() => {
    eventBus = createMockEventBus();
    mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  it("on registry-updated signal, emits request for subagent registry", () => {
    createPodReporter({ events: eventBus, sessionId, fetchFn: mockFetch as typeof fetch });

    eventBus.trigger("subagent-orchestrator:registry-updated");

    const requestEmissions = eventBus.emitted.filter(
      (e) => e.event === "pi-fleet:request-subagent-registry",
    );
    expect(requestEmissions).toHaveLength(1);
  });

  it("on registry-response, posts ownership to server", async () => {
    createPodReporter({ events: eventBus, sessionId, fetchFn: mockFetch as typeof fetch });

    eventBus.trigger("subagent-orchestrator:registry-response", {
      subagentIds: ["agent-a", "agent-b"],
    });

    // Allow microtask to process async postOwnership
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());

    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8314/api/pods/ownership",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentSessionId: sessionId,
          subagentIds: ["agent-a", "agent-b"],
        }),
      }),
    );
  });

  it("requestInitialState emits request for catch-up on session_start", () => {
    const reporter = createPodReporter({
      events: eventBus,
      sessionId,
      fetchFn: mockFetch as typeof fetch,
    });

    reporter.requestInitialState();

    const requestEmissions = eventBus.emitted.filter(
      (e) => e.event === "pi-fleet:request-subagent-registry",
    );
    expect(requestEmissions).toHaveLength(1);
  });

  it("full signal/request/response cycle posts ownership", async () => {
    createPodReporter({ events: eventBus, sessionId, fetchFn: mockFetch as typeof fetch });

    // Step 1: orchestrator signals registry-updated
    eventBus.trigger("subagent-orchestrator:registry-updated");

    // Step 2: verify request was emitted
    expect(eventBus.emitted).toContainEqual({
      event: "pi-fleet:request-subagent-registry",
      data: undefined,
    });

    // Step 3: orchestrator responds
    eventBus.trigger("subagent-orchestrator:registry-response", {
      subagentIds: ["child-1"],
    });

    // Step 4: ownership posted
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.parentSessionId).toBe(sessionId);
    expect(body.subagentIds).toEqual(["child-1"]);
  });

  it("gracefully handles fetch failure (no errors thrown)", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    createPodReporter({ events: eventBus, sessionId, fetchFn: mockFetch as typeof fetch });

    // Should not throw
    eventBus.trigger("subagent-orchestrator:registry-response", {
      subagentIds: ["agent-a"],
    });

    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    // No error thrown = test passes
  });

  it("ignores malformed registry-response payloads", () => {
    createPodReporter({ events: eventBus, sessionId, fetchFn: mockFetch as typeof fetch });

    // Trigger with invalid payload
    eventBus.trigger("subagent-orchestrator:registry-response", null);
    eventBus.trigger("subagent-orchestrator:registry-response", {});
    eventBus.trigger("subagent-orchestrator:registry-response", {
      subagentIds: "not-an-array",
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles multiple registry-updated signals correctly", () => {
    createPodReporter({ events: eventBus, sessionId, fetchFn: mockFetch as typeof fetch });

    eventBus.trigger("subagent-orchestrator:registry-updated");
    eventBus.trigger("subagent-orchestrator:registry-updated");
    eventBus.trigger("subagent-orchestrator:registry-updated");

    const requestEmissions = eventBus.emitted.filter(
      (e) => e.event === "pi-fleet:request-subagent-registry",
    );
    expect(requestEmissions).toHaveLength(3);
  });
});
