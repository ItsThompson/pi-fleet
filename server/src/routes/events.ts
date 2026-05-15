import type { FastifyInstance } from "fastify";
import type { SSEEvent } from "@pi-fleet/shared";
import { SSE_KEEPALIVE_MS } from "@pi-fleet/shared";
import type { EventBus } from "../event-bus.js";
import { randomUUID } from "node:crypto";

export function registerEventsRoute(
  app: FastifyInstance,
  eventBus: EventBus,
): void {
  app.get("/api/events", async (request, reply) => {
    const clientId = randomUUID();

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send connected event
    const connectedEvent: SSEEvent = {
      type: "connected",
      data: { serverTime: new Date().toISOString() },
    };
    writeSSE(reply.raw, connectedEvent);

    // Set up keep-alive heartbeat
    const keepAliveTimer = setInterval(() => {
      const heartbeatEvent: SSEEvent = {
        type: "heartbeat",
        data: {} as Record<string, never>,
      };
      writeSSE(reply.raw, heartbeatEvent);
    }, SSE_KEEPALIVE_MS);

    // Register client with event bus
    eventBus.addClient({
      id: clientId,
      send: (event: SSEEvent) => writeSSE(reply.raw, event),
      close: () => reply.raw.end(),
    });

    // Clean up on disconnect
    request.raw.on("close", () => {
      clearInterval(keepAliveTimer);
      eventBus.removeClient(clientId);
    });

    // Prevent Fastify from sending its own response
    await reply.hijack();
  });
}

function writeSSE(
  stream: { write: (chunk: string) => boolean },
  event: SSEEvent,
): void {
  stream.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
}
