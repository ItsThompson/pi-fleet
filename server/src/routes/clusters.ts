import type { FastifyInstance } from "fastify";
import type { ClusterStore } from "../cluster-store.js";
import type { PodRegistry } from "../pod-registry.js";
import type { SessionRegistry } from "../session-registry.js";
import type { EventBus } from "../event-bus.js";
import {
	createClusterBodySchema,
	updateClusterBodySchema,
	reorderClustersBodySchema,
	assignClusterBodySchema,
} from "../schemas.js";
import { log } from "../utils/logger.js";

export function registerClusterRoutes(
	app: FastifyInstance,
	clusterStore: ClusterStore,
	podRegistry: PodRegistry,
	sessionRegistry: SessionRegistry,
	eventBus: EventBus,
): void {
	app.get("/api/clusters", async (_request, reply) => {
		const clusters = clusterStore.getClusters();
		const pods = podRegistry.getPods();
		const sessions = sessionRegistry.getAll();

		// Compute assignment for each session's lead
		const clusterPodMap = new Map<string, string[]>();
		const clusterAttentionMap = new Map<string, number>();
		const unclusteredPodIds: string[] = [];
		let unclusteredAttention = 0;

		clusters.forEach((cluster) => {
			clusterPodMap.set(cluster.id, []);
			clusterAttentionMap.set(cluster.id, 0);
		});

		pods.forEach((pod) => {
			const leadSession = sessions.find(
				(s) => s.sessionId === pod.leadSessionId,
			);
			if (!leadSession) {
				unclusteredPodIds.push(pod.leadSessionId);
				unclusteredAttention += pod.attentionCount;
				return;
			}

			const assignment = clusterStore.assignSession(
				leadSession.sessionId,
				leadSession.cwd,
			);

			if (assignment.clusterId && clusterPodMap.has(assignment.clusterId)) {
				clusterPodMap.get(assignment.clusterId)!.push(pod.leadSessionId);
				clusterAttentionMap.set(
					assignment.clusterId,
					(clusterAttentionMap.get(assignment.clusterId) ?? 0) +
						pod.attentionCount,
				);
			} else {
				unclusteredPodIds.push(pod.leadSessionId);
				unclusteredAttention += pod.attentionCount;
			}
		});

		const enrichedClusters = clusters.map((cluster) => ({
			...cluster,
			podIds: clusterPodMap.get(cluster.id) ?? [],
			attentionCount: clusterAttentionMap.get(cluster.id) ?? 0,
		}));

		return reply.status(200).send({
			clusters: enrichedClusters,
			unclustered: {
				podIds: unclusteredPodIds,
				attentionCount: unclusteredAttention,
			},
		});
	});

	app.post("/api/clusters", async (request, reply) => {
		const result = createClusterBodySchema.safeParse(request.body);
		if (!result.success) {
			return reply.status(400).send({
				error: "Validation failed",
				issues: result.error.issues,
			});
		}

		const cluster = clusterStore.createCluster(
			result.data.name,
			result.data.directories,
		);

		eventBus.broadcast({ type: "cluster:created", data: cluster });

		log({
			timestamp: new Date().toISOString(),
			event: "cluster_created",
			clusterId: cluster.id,
			name: cluster.name,
		});

		return reply.status(201).send(cluster);
	});

	app.patch<{ Params: { id: string } }>(
		"/api/clusters/:id",
		async (request, reply) => {
			const result = updateClusterBodySchema.safeParse(request.body);
			if (!result.success) {
				return reply.status(400).send({
					error: "Validation failed",
					issues: result.error.issues,
				});
			}

			const cluster = clusterStore.updateCluster(
				request.params.id,
				result.data,
			);
			if (!cluster) {
				return reply.status(404).send({ error: "Cluster not found" });
			}

			eventBus.broadcast({ type: "cluster:updated", data: cluster });

			// Re-evaluate assignments for all sessions
			reEvaluateAssignments(sessionRegistry, clusterStore, eventBus);

			log({
				timestamp: new Date().toISOString(),
				event: "cluster_updated",
				clusterId: cluster.id,
			});

			return reply.status(200).send(cluster);
		},
	);

	app.delete<{ Params: { id: string } }>(
		"/api/clusters/:id",
		async (request, reply) => {
			const deleted = clusterStore.deleteCluster(request.params.id);
			if (!deleted) {
				return reply.status(404).send({ error: "Cluster not found" });
			}

			eventBus.broadcast({
				type: "cluster:deleted",
				data: { clusterId: request.params.id },
			});

			// Re-evaluate assignments: pods previously in this cluster need new assignments
			reEvaluateAssignments(sessionRegistry, clusterStore, eventBus);

			log({
				timestamp: new Date().toISOString(),
				event: "cluster_deleted",
				clusterId: request.params.id,
			});

			return reply.status(200).send({ ok: true });
		},
	);

	app.post("/api/clusters/reorder", async (request, reply) => {
		const result = reorderClustersBodySchema.safeParse(request.body);
		if (!result.success) {
			return reply.status(400).send({
				error: "Validation failed",
				issues: result.error.issues,
			});
		}

		clusterStore.reorderClusters(result.data.orderedIds);

		eventBus.broadcast({
			type: "cluster:reordered",
			data: { orderedIds: result.data.orderedIds },
		});

		log({
			timestamp: new Date().toISOString(),
			event: "cluster_reordered",
		});

		return reply.status(200).send({ ok: true });
	});

	app.post("/api/clusters/assign", async (request, reply) => {
		const result = assignClusterBodySchema.safeParse(request.body);
		if (!result.success) {
			return reply.status(400).send({
				error: "Validation failed",
				issues: result.error.issues,
			});
		}

		const { sessionId, clusterId } = result.data;

		clusterStore.setManualAssignment(sessionId, clusterId);

		const session = sessionRegistry.get(sessionId);
		const assignment = session
			? clusterStore.assignSession(sessionId, session.cwd)
			: { clusterId, reason: "manual" as const };

		eventBus.broadcast({
			type: "cluster:assignment-changed",
			data: {
				sessionId,
				clusterId: assignment.clusterId,
				reason: assignment.reason,
			},
		});

		log({
			timestamp: new Date().toISOString(),
			event: "cluster_assignment_changed",
			sessionId,
			clusterId,
		});

		return reply.status(200).send({ ok: true });
	});
}

/**
 * Re-evaluates cluster assignments for all active sessions.
 * Emits assignment-changed events for any that changed.
 */
function reEvaluateAssignments(
	sessionRegistry: SessionRegistry,
	clusterStore: ClusterStore,
	eventBus: EventBus,
): void {
	const sessions = sessionRegistry.getAll();

	sessions.forEach((session) => {
		const newAssignment = clusterStore.assignSession(
			session.sessionId,
			session.cwd,
		);

		// Always emit re-evaluation so clients stay in sync
		eventBus.broadcast({
			type: "cluster:assignment-changed",
			data: {
				sessionId: session.sessionId,
				clusterId: newAssignment.clusterId,
				reason: newAssignment.reason,
			},
		});
	});
}
