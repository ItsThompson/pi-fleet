import type { FastifyInstance } from "fastify";
import type { SessionRegistry } from "../session-registry.js";
import { openTerminalBodySchema } from "../schemas.js";
import { log } from "../utils/logger.js";

export function registerOpenTerminalRoute(
  app: FastifyInstance,
  registry: SessionRegistry,
): void {
  app.post("/api/open-terminal", async (request, reply) => {
    const result = openTerminalBodySchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        error: "Validation failed",
        issues: result.error.issues,
      });
    }

    const { sessionId } = result.data;
    const session = registry.get(sessionId);

    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    if (!session.tmuxTarget) {
      return reply.status(400).send({ error: "Session has no tmux target" });
    }

    log({
      timestamp: new Date().toISOString(),
      event: "open_terminal_resolved",
      sessionId,
      tmuxTarget: session.tmuxTarget,
    });

    return reply.status(200).send({ tmuxTarget: session.tmuxTarget });
  });
}
