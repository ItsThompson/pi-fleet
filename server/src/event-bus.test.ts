import { describe, it, expect, beforeEach } from "vitest";
import { EventBus } from "./event-bus.js";
import type { SSEClient } from "./event-bus.js";
import type { SSEEvent } from "@pi-fleet/shared";

describe("EventBus", () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  function createMockClient(id: string): SSEClient & {
    receivedEvents: SSEEvent[];
  } {
    const receivedEvents: SSEEvent[] = [];
    return {
      id,
      receivedEvents,
      send: (event: SSEEvent) => receivedEvents.push(event),
      close: () => {},
    };
  }

  it("starts with zero clients", () => {
    expect(eventBus.clientCount).toBe(0);
  });

  it("tracks added clients", () => {
    const client = createMockClient("client-1");
    eventBus.addClient(client);
    expect(eventBus.clientCount).toBe(1);
  });

  it("removes clients", () => {
    const client = createMockClient("client-1");
    eventBus.addClient(client);
    eventBus.removeClient("client-1");
    expect(eventBus.clientCount).toBe(0);
  });

  it("broadcasts event to all connected clients", () => {
    const client1 = createMockClient("client-1");
    const client2 = createMockClient("client-2");
    eventBus.addClient(client1);
    eventBus.addClient(client2);

    const event: SSEEvent = {
      type: "session:added",
      data: {
        sessionId: "sess-1",
        pid: 1234,
        cwd: "/test",
        tmuxTarget: null,
        startTime: "2025-01-01T00:00:00.000Z",
        activity: "idle",
        lastSeen: "2025-01-01T00:00:00.000Z",
        lastEventTime: "2025-01-01T00:00:00.000Z",
      },
    };

    eventBus.broadcast(event);

    expect(client1.receivedEvents).toHaveLength(1);
    expect(client1.receivedEvents[0]).toEqual(event);
    expect(client2.receivedEvents).toHaveLength(1);
    expect(client2.receivedEvents[0]).toEqual(event);
  });

  it("does not send events to removed clients", () => {
    const client = createMockClient("client-1");
    eventBus.addClient(client);
    eventBus.removeClient("client-1");

    eventBus.broadcast({
      type: "heartbeat",
      data: {} as Record<string, never>,
    });

    expect(client.receivedEvents).toHaveLength(0);
  });

  it("handles client send errors gracefully", () => {
    const failingClient: SSEClient = {
      id: "failing",
      send: () => {
        throw new Error("Connection reset");
      },
      close: () => {},
    };
    const goodClient = createMockClient("good");

    eventBus.addClient(failingClient);
    eventBus.addClient(goodClient);

    const event: SSEEvent = {
      type: "session:removed",
      data: { sessionId: "sess-1" },
    };

    // Should not throw
    eventBus.broadcast(event);

    // Good client still received the event
    expect(goodClient.receivedEvents).toHaveLength(1);
    // Failing client was removed
    expect(eventBus.clientCount).toBe(1);
  });
});
