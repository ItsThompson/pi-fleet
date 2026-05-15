import type { FastifyInstance } from "fastify";
import type { SessionRegistry } from "../session-registry.js";
import type { PodRegistry } from "../pod-registry.js";
import { detectPiWatch } from "../utils/pi-watch-detect.js";

export function registerHealthRoute(
  app: FastifyInstance,
  registry: SessionRegistry,
  podRegistry: PodRegistry,
  startTime: number,
): void {
  app.get("/api/health", async (_request, reply) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    return reply.status(200).send({
      status: "ok",
      uptime: uptimeSeconds,
      sessions: registry.size,
      pods: podRegistry.podCount,
      version: "0.1.0",
      piWatchDetected: detectPiWatch(),
    });
  });
}
