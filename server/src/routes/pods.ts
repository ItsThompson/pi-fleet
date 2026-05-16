import type { FastifyInstance } from "fastify";
import type { PodRegistry } from "../pod-registry.js";
import { ownershipBodySchema } from "../schemas.js";
import { log } from "../utils/logger.js";

export function registerPodRoutes(
	app: FastifyInstance,
	podRegistry: PodRegistry,
): void {
	app.get("/api/pods", async (_request, reply) => {
		const pods = podRegistry.getPods();
		return reply.status(200).send({ pods });
	});

	app.post("/api/pods/ownership", async (request, reply) => {
		const result = ownershipBodySchema.safeParse(request.body);
		if (!result.success) {
			return reply.status(400).send({
				error: "Validation failed",
				issues: result.error.issues,
			});
		}

		const { parentSessionId, subagentIds } = result.data;

		const { matchedIds, unmatchedIds } = podRegistry.reportOwnership(
			parentSessionId,
			subagentIds,
		);

		log({
			timestamp: new Date().toISOString(),
			event: "ownership_reported",
			parentSessionId,
			matchedCount: matchedIds.length,
			unmatchedCount: unmatchedIds.length,
		});

		return reply.status(200).send({ ok: true, matchedIds, unmatchedIds });
	});
}
