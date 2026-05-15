import type { FastifyInstance } from "fastify";
import type { SessionRegistry } from "../session-registry.js";

export function registerHealthRoute(
  app: FastifyInstance,
  registry: SessionRegistry,
  startTime: number,
): void {
  app.get("/api/health", async (_request, reply) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    return reply.status(200).send({
      status: "ok",
      uptime: uptimeSeconds,
      sessions: registry.size,
      pods: 0, // Pod registry not yet implemented
      version: "0.1.0",
    });
  });
}
