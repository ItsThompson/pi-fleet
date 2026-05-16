/**
 * SSE event dispatcher with Zod validation at the parse boundary.
 * Routes validated events to the correct store method.
 * Malformed events are logged and discarded: they never corrupt store state.
 */
import { z } from "zod";
import { useSessionStore } from "@/stores/session-store";
import { usePodStore } from "@/stores/pod-store";
import { useClusterStore } from "@/stores/cluster-store";
import { useNavigationStore } from "@/stores/navigation-store";

// --- Zod schemas (dispatcher-internal, not exported) ---

const activityStatusSchema = z.enum([
	"processing",
	"running_tool",
	"idle",
	"pending_approval",
]);

const contextUsageSchema = z.object({
	tokens: z.number().nullable(),
	contextWindow: z.number(),
	percent: z.number().nullable(),
});

const sessionEventSchema = z.object({
	sessionId: z.string(),
	pid: z.number(),
	cwd: z.string(),
	tmuxTarget: z.string().nullable(),
	startTime: z.string(),
	activity: activityStatusSchema,
	lastSeen: z.string(),
	lastEventTime: z.string(),
	agentName: z.string().optional(),
	subagentId: z.string().optional(),
	model: z.string().optional(),
	contextUsage: contextUsageSchema.optional(),
	turnCount: z.number().optional(),
	thinkingLevel: z.string().optional(),
	lastToolName: z.string().optional(),
});

const sessionRemovedSchema = z.object({
	sessionId: z.string(),
});

const podEventSchema = z.object({
	leadSessionId: z.string(),
	memberSessionIds: z.array(z.string()),
	displayName: z.string(),
	state: activityStatusSchema,
	attentionCount: z.number(),
});

const podDissolvedSchema = z.object({
	leadSessionId: z.string(),
});

const clusterEventSchema = z.object({
	id: z.string(),
	name: z.string(),
	directories: z.array(z.string()),
	sortOrder: z.number(),
});

const clusterDeletedSchema = z.object({
	clusterId: z.string(),
});

const clusterReorderedSchema = z.object({
	orderedIds: z.array(z.string()),
});

const assignmentChangedSchema = z.object({
	sessionId: z.string(),
	clusterId: z.string().nullable(),
});

const connectedEventSchema = z.object({
	serverTime: z.string(),
});

// --- Dispatcher ---

export interface DispatchDeps {
	/** Called on "connected" event to trigger full state refetch */
	onConnected: () => void;
	/** Called on "cluster:assignment-changed" to trigger cluster refetch */
	onAssignmentChanged: () => void;
}

/**
 * Create a dispatcher that routes SSE events to store actions.
 * Validates event data with Zod before dispatching.
 * Malformed events are logged and discarded (never corrupt state).
 */
export function createSSEDispatcher(deps: DispatchDeps): {
	dispatch: (eventType: string, rawData: string) => void;
} {
	function dispatch(eventType: string, rawData: string): void {
		if (eventType === "heartbeat") {
			return;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(rawData);
		} catch {
			console.warn("SSE: invalid JSON", rawData);
			return;
		}

		if (eventType === "connected") {
			const result = connectedEventSchema.safeParse(parsed);
			if (!result.success) {
				console.warn("SSE: invalid event data", {
					type: eventType,
					issues: result.error.issues,
				});
				return;
			}
			deps.onConnected();
			return;
		}

		dispatchStoreEvent(eventType, parsed, deps);
	}

	return { dispatch };
}

function dispatchStoreEvent(
	eventType: string,
	parsed: unknown,
	deps: DispatchDeps,
): void {
	switch (eventType) {
		case "session:added": {
			const result = sessionEventSchema.safeParse(parsed);
			if (!result.success) {
				logInvalid(eventType, result.error.issues);
				return;
			}
			useSessionStore.getState().addSession(result.data);
			break;
		}
		case "session:updated": {
			const result = sessionEventSchema.safeParse(parsed);
			if (!result.success) {
				logInvalid(eventType, result.error.issues);
				return;
			}
			useSessionStore.getState().updateSession(result.data);
			break;
		}
		case "session:removed": {
			const result = sessionRemovedSchema.safeParse(parsed);
			if (!result.success) {
				logInvalid(eventType, result.error.issues);
				return;
			}
			useSessionStore.getState().removeSession(result.data.sessionId);
			break;
		}
		case "pod:formed":
		case "pod:updated": {
			const result = podEventSchema.safeParse(parsed);
			if (!result.success) {
				logInvalid(eventType, result.error.issues);
				return;
			}
			usePodStore.getState().addOrUpdatePod(result.data);
			break;
		}
		case "pod:dissolved": {
			const result = podDissolvedSchema.safeParse(parsed);
			if (!result.success) {
				logInvalid(eventType, result.error.issues);
				return;
			}
			usePodStore.getState().removePod(result.data.leadSessionId);
			// Reset nav after removal: ensures re-renders never find a stale entity
			useNavigationStore
				.getState()
				.resetIfViewing("pod", result.data.leadSessionId);
			break;
		}
		case "cluster:created": {
			const result = clusterEventSchema.safeParse(parsed);
			if (!result.success) {
				logInvalid(eventType, result.error.issues);
				return;
			}
			useClusterStore.getState().addCluster(result.data);
			break;
		}
		case "cluster:updated": {
			const result = clusterEventSchema.safeParse(parsed);
			if (!result.success) {
				logInvalid(eventType, result.error.issues);
				return;
			}
			useClusterStore.getState().updateCluster(result.data);
			break;
		}
		case "cluster:deleted": {
			const result = clusterDeletedSchema.safeParse(parsed);
			if (!result.success) {
				logInvalid(eventType, result.error.issues);
				return;
			}
			useClusterStore.getState().removeCluster(result.data.clusterId);
			// Reset nav after removal: ensures re-renders never find a stale entity
			useNavigationStore
				.getState()
				.resetIfViewing("cluster", result.data.clusterId);
			break;
		}
		case "cluster:reordered": {
			const result = clusterReorderedSchema.safeParse(parsed);
			if (!result.success) {
				logInvalid(eventType, result.error.issues);
				return;
			}
			useClusterStore.getState().reorderClusters(result.data.orderedIds);
			break;
		}
		case "cluster:assignment-changed": {
			const result = assignmentChangedSchema.safeParse(parsed);
			if (!result.success) {
				logInvalid(eventType, result.error.issues);
				return;
			}
			// Update manualAssignments in the cluster store directly
			useClusterStore
				.getState()
				.setManualAssignment(result.data.sessionId, result.data.clusterId);
			// Also notify for any additional side effects (e.g., debounced refetch)
			deps.onAssignmentChanged();
			break;
		}
	}
}

function logInvalid(eventType: string, issues: z.ZodIssue[]): void {
	console.warn("SSE: invalid event data", { type: eventType, issues });
}
