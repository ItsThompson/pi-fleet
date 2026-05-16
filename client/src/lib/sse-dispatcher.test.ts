import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSSEDispatcher, type DispatchDeps } from "./sse-dispatcher";
import { useSessionStore } from "@/stores/session-store";
import { usePodStore } from "@/stores/pod-store";
import { useClusterStore } from "@/stores/cluster-store";
import { useNavigationStore } from "@/stores/navigation-store";
import type {
	RegisteredSession,
	Pod,
	ClusterDefinition,
} from "@pi-fleet/shared";

function buildSession(
	overrides?: Partial<RegisteredSession>,
): RegisteredSession {
	return {
		sessionId: "s1",
		pid: 123,
		cwd: "/home/user/project",
		tmuxTarget: null,
		startTime: "2025-01-01T00:00:00Z",
		activity: "processing",
		lastSeen: "2025-01-01T00:00:00Z",
		lastEventTime: "2025-01-01T00:00:00Z",
		...overrides,
	};
}

function buildPod(overrides?: Partial<Pod>): Pod {
	return {
		leadSessionId: "lead-1",
		memberSessionIds: ["lead-1", "sub-1"],
		displayName: "my-pod",
		state: "processing",
		attentionCount: 0,
		...overrides,
	};
}

function buildCluster(
	overrides?: Partial<ClusterDefinition>,
): ClusterDefinition {
	return {
		id: "cluster-1",
		name: "My Cluster",
		directories: ["/home/user/project"],
		sortOrder: 0,
		...overrides,
	};
}

describe("sse-dispatcher", () => {
	let onConnected: ReturnType<typeof vi.fn>;
	let onAssignmentChanged: ReturnType<typeof vi.fn>;
	let deps: DispatchDeps;
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		onConnected = vi.fn();
		onAssignmentChanged = vi.fn();
		deps = { onConnected, onAssignmentChanged } as unknown as DispatchDeps;
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		useSessionStore.setState({
			sessions: new Map(),
			activityChangedAt: new Map(),
		});
		usePodStore.setState({ pods: new Map() });
		useClusterStore.setState({
			clusters: [],
			manualAssignments: {},
		});
		useNavigationStore.setState({
			current: { view: "cluster", id: undefined },
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("session events", () => {
		it("routes session:added to addSession", () => {
			const dispatcher = createSSEDispatcher(deps);
			const session = buildSession();

			dispatcher.dispatch("session:added", JSON.stringify(session));

			expect(useSessionStore.getState().sessions.get("s1")).toEqual(session);
		});

		it("routes session:updated to updateSession", () => {
			useSessionStore.getState().addSession(buildSession());
			const dispatcher = createSSEDispatcher(deps);

			const updated = buildSession({ activity: "idle" });
			dispatcher.dispatch("session:updated", JSON.stringify(updated));

			expect(useSessionStore.getState().sessions.get("s1")!.activity).toBe(
				"idle",
			);
		});

		it("routes session:removed to removeSession", () => {
			useSessionStore.getState().addSession(buildSession());
			const dispatcher = createSSEDispatcher(deps);

			dispatcher.dispatch(
				"session:removed",
				JSON.stringify({ sessionId: "s1" }),
			);

			expect(useSessionStore.getState().sessions.size).toBe(0);
		});
	});

	describe("pod events", () => {
		it("routes pod:formed to addOrUpdatePod", () => {
			const dispatcher = createSSEDispatcher(deps);
			const pod = buildPod();

			dispatcher.dispatch("pod:formed", JSON.stringify(pod));

			expect(usePodStore.getState().pods.get("lead-1")).toEqual(pod);
		});

		it("routes pod:updated to addOrUpdatePod", () => {
			const dispatcher = createSSEDispatcher(deps);
			const pod = buildPod({ state: "idle" });

			dispatcher.dispatch("pod:updated", JSON.stringify(pod));

			expect(usePodStore.getState().pods.get("lead-1")!.state).toBe("idle");
		});

		it("routes pod:dissolved to removePod", () => {
			usePodStore.getState().addOrUpdatePod(buildPod());
			const dispatcher = createSSEDispatcher(deps);

			dispatcher.dispatch(
				"pod:dissolved",
				JSON.stringify({ leadSessionId: "lead-1" }),
			);

			expect(usePodStore.getState().pods.size).toBe(0);
		});

		it("pod:dissolved triggers resetIfViewing with correct args", () => {
			usePodStore.getState().addOrUpdatePod(buildPod());
			useNavigationStore.getState().navigateTo("pod", "lead-1");
			const dispatcher = createSSEDispatcher(deps);

			dispatcher.dispatch(
				"pod:dissolved",
				JSON.stringify({ leadSessionId: "lead-1" }),
			);

			const { current } = useNavigationStore.getState();
			expect(current.view).toBe("cluster");
			expect(current.id).toBeUndefined();
		});

		it("pod:dissolved does not reset navigation when viewing a different pod", () => {
			usePodStore.getState().addOrUpdatePod(buildPod());
			useNavigationStore.getState().navigateTo("pod", "other-pod");
			const dispatcher = createSSEDispatcher(deps);

			dispatcher.dispatch(
				"pod:dissolved",
				JSON.stringify({ leadSessionId: "lead-1" }),
			);

			const { current } = useNavigationStore.getState();
			expect(current.view).toBe("pod");
			expect(current.id).toBe("other-pod");
		});
	});

	describe("cluster events", () => {
		it("routes cluster:created to addCluster", () => {
			const dispatcher = createSSEDispatcher(deps);
			const cluster = buildCluster();

			dispatcher.dispatch("cluster:created", JSON.stringify(cluster));

			expect(useClusterStore.getState().clusters).toHaveLength(1);
			expect(useClusterStore.getState().clusters[0].id).toBe("cluster-1");
		});

		it("routes cluster:updated to updateCluster", () => {
			useClusterStore.getState().addCluster(buildCluster());
			const dispatcher = createSSEDispatcher(deps);

			const updated = buildCluster({ name: "Renamed" });
			dispatcher.dispatch("cluster:updated", JSON.stringify(updated));

			expect(useClusterStore.getState().clusters[0].name).toBe("Renamed");
		});

		it("routes cluster:deleted to removeCluster", () => {
			useClusterStore.getState().addCluster(buildCluster());
			const dispatcher = createSSEDispatcher(deps);

			dispatcher.dispatch(
				"cluster:deleted",
				JSON.stringify({ clusterId: "cluster-1" }),
			);

			expect(useClusterStore.getState().clusters).toHaveLength(0);
		});

		it("cluster:deleted triggers resetIfViewing with correct args", () => {
			useClusterStore.getState().addCluster(buildCluster());
			useNavigationStore.getState().navigateTo("cluster", "cluster-1");
			const dispatcher = createSSEDispatcher(deps);

			dispatcher.dispatch(
				"cluster:deleted",
				JSON.stringify({ clusterId: "cluster-1" }),
			);

			const { current } = useNavigationStore.getState();
			expect(current.view).toBe("cluster");
			expect(current.id).toBeUndefined();
		});

		it("cluster:deleted does not reset navigation when viewing a pod inside that cluster", () => {
			useClusterStore.getState().addCluster(buildCluster());
			useNavigationStore.getState().navigateTo("pod", "pod-inside-cluster");
			const dispatcher = createSSEDispatcher(deps);

			dispatcher.dispatch(
				"cluster:deleted",
				JSON.stringify({ clusterId: "cluster-1" }),
			);

			const { current } = useNavigationStore.getState();
			expect(current.view).toBe("pod");
			expect(current.id).toBe("pod-inside-cluster");
		});

		it("routes cluster:reordered to reorderClusters", () => {
			useClusterStore
				.getState()
				.addCluster(buildCluster({ id: "a", sortOrder: 0 }));
			useClusterStore
				.getState()
				.addCluster(buildCluster({ id: "b", sortOrder: 1 }));
			const dispatcher = createSSEDispatcher(deps);

			dispatcher.dispatch(
				"cluster:reordered",
				JSON.stringify({ orderedIds: ["b", "a"] }),
			);

			const clusters = useClusterStore.getState().clusters;
			expect(clusters[0].id).toBe("b");
			expect(clusters[1].id).toBe("a");
		});

		it("routes cluster:assignment-changed to onAssignmentChanged callback", () => {
			const dispatcher = createSSEDispatcher(deps);

			dispatcher.dispatch(
				"cluster:assignment-changed",
				JSON.stringify({ sessionId: "s1", clusterId: "cluster-1" }),
			);

			expect(onAssignmentChanged).toHaveBeenCalledOnce();
		});
	});

	describe("connected event", () => {
		it("calls deps.onConnected()", () => {
			const dispatcher = createSSEDispatcher(deps);

			dispatcher.dispatch(
				"connected",
				JSON.stringify({ serverTime: "2025-01-01T00:00:00Z" }),
			);

			expect(onConnected).toHaveBeenCalledOnce();
		});
	});

	describe("heartbeat event", () => {
		it("is a no-op (no state mutation, no error)", () => {
			const dispatcher = createSSEDispatcher(deps);

			dispatcher.dispatch("heartbeat", JSON.stringify({}));

			expect(useSessionStore.getState().sessions.size).toBe(0);
			expect(usePodStore.getState().pods.size).toBe(0);
			expect(warnSpy).not.toHaveBeenCalled();
		});
	});

	describe("malformed JSON", () => {
		it("logs a warning and discards the event", () => {
			const dispatcher = createSSEDispatcher(deps);

			dispatcher.dispatch("session:added", "not-json{{{");

			expect(warnSpy).toHaveBeenCalledWith("SSE: invalid JSON", "not-json{{{");
			expect(useSessionStore.getState().sessions.size).toBe(0);
		});
	});

	describe("invalid event shape (Zod failure)", () => {
		it("logs event type and issues when session data is invalid", () => {
			const dispatcher = createSSEDispatcher(deps);

			dispatcher.dispatch("session:added", JSON.stringify({ sessionId: 123 }));

			expect(warnSpy).toHaveBeenCalledWith(
				"SSE: invalid event data",
				expect.objectContaining({
					type: "session:added",
					issues: expect.any(Array),
				}),
			);
			expect(useSessionStore.getState().sessions.size).toBe(0);
		});

		it("logs event type and issues when pod data is invalid", () => {
			const dispatcher = createSSEDispatcher(deps);

			dispatcher.dispatch(
				"pod:formed",
				JSON.stringify({ leadSessionId: null }),
			);

			expect(warnSpy).toHaveBeenCalledWith(
				"SSE: invalid event data",
				expect.objectContaining({ type: "pod:formed" }),
			);
			expect(usePodStore.getState().pods.size).toBe(0);
		});

		it("logs event type and issues when connected event is invalid", () => {
			const dispatcher = createSSEDispatcher(deps);

			dispatcher.dispatch("connected", JSON.stringify({ serverTime: 123 }));

			expect(warnSpy).toHaveBeenCalledWith(
				"SSE: invalid event data",
				expect.objectContaining({ type: "connected" }),
			);
			expect(onConnected).not.toHaveBeenCalled();
		});

		it("discards invalid cluster data without mutating state", () => {
			const dispatcher = createSSEDispatcher(deps);

			dispatcher.dispatch("cluster:created", JSON.stringify({ id: 999 }));

			expect(useClusterStore.getState().clusters).toHaveLength(0);
		});
	});
});
