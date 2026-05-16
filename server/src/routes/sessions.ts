import type { FastifyInstance } from "fastify";
import type { SessionRegistry } from "../session-registry.js";
import { registerBodySchema, heartbeatBodySchema } from "../schemas.js";
import { log } from "../utils/logger.js";

export function registerSessionRoutes(
	app: FastifyInstance,
	registry: SessionRegistry,
): void {
	app.post("/api/sessions/register", async (request, reply) => {
		const result = registerBodySchema.safeParse(request.body);
		if (!result.success) {
			return reply.status(400).send({
				error: "Validation failed",
				issues: result.error.issues,
			});
		}

		const session = registry.register(result.data);

		log({
			timestamp: new Date().toISOString(),
			event: "session_registered",
			sessionId: session.sessionId,
			cwd: session.cwd,
		});

		return reply.status(201).send({ ok: true });
	});

	app.post<{ Params: { id: string } }>(
		"/api/sessions/:id/heartbeat",
		async (request, reply) => {
			const result = heartbeatBodySchema.safeParse(request.body);
			if (!result.success) {
				return reply.status(400).send({
					error: "Validation failed",
					issues: result.error.issues,
				});
			}

			const session = registry.heartbeat(result.data);
			if (!session) {
				return reply.status(404).send({ error: "Session not found" });
			}

			return reply.status(200).send({ ok: true });
		},
	);

	app.post<{ Params: { id: string } }>(
		"/api/sessions/:id/unregister",
		async (request, reply) => {
			const sessionId = request.params.id;
			const existed = registry.unregister(sessionId);

			if (!existed) {
				return reply.status(404).send({ error: "Session not found" });
			}

			log({
				timestamp: new Date().toISOString(),
				event: "session_unregistered",
				sessionId,
			});

			return reply.status(200).send({ ok: true });
		},
	);

	app.get("/api/sessions", async (_request, reply) => {
		const sessions = registry.getAll();
		return reply.status(200).send({ sessions });
	});
}
