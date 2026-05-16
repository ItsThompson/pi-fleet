/**
 * Cross-Store Consistency Integration Tests
 *
 * Validates that all zustand stores + derived selectors agree on state at every
 * step of an SSE event sequence. The safety net preventing regression to the
 * stale-cache bugs this epic eliminates.
 *
 * Boundary: real dispatcher → real stores → real derived selectors.
 * Only `fetch` is mocked (for refetch scenarios).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSSEDispatcher } from "@/lib/sse-dispatcher";
import { createSSERefetch, type SSERefetch } from "@/lib/sse-refetch";
import {
	deriveClusterState,
	type DerivedClusterState,
} from "@/lib/derived-clusters";
import { isAttentionState } from "@/lib/attention-utils";
import { useSessionStore } from "@/stores/session-store";
import { usePodStore } from "@/stores/pod-store";
import { useClusterStore } from "@/stores/cluster-store";
import { useNavigationStore } from "@/stores/navigation-store";
import { useNotificationDismissStore } from "@/stores/notification-dismiss-store";
import { computeVisibleAttentionCount } from "@/lib/attention-utils";
import type {
	RegisteredSession,
	Pod,
	ClusterDefinition,
} from "@pi-fleet/shared";

// --- Test data factories ---

const HOMEDIR = "/Users/testuser";

function buildSession(
	overrides?: Partial<RegisteredSession>,
): RegisteredSession {
	return {
		sessionId: "session-1",
		pid: 1000,
		cwd: `${HOMEDIR}/projects/app`,
		tmuxTarget: null,
		startTime: "2025-01-01T00:00:00Z",
		activity: "processing",
		lastSeen: "2025-01-01T00:01:00Z",
		lastEventTime: "2025-01-01T00:01:00Z",
		...overrides,
	};
}

function buildPod(overrides?: Partial<Pod>): Pod {
	return {
		leadSessionId: "session-1",
		memberSessionIds: ["session-1"],
		displayName: "test-pod",
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
		name: "App Cluster",
		directories: [`${HOMEDIR}/projects/app`],
		sortOrder: 0,
		...overrides,
	};
}

// --- Integration helpers ---

let dispatcher: ReturnType<typeof createSSEDispatcher>;
let onConnected: () => void;

function simulateEvent(type: string, data: object): void {
	dispatcher.dispatch(type, JSON.stringify(data));
}

function simulateRefetch(response: {
	sessions?: RegisteredSession[];
	pods?: Pod[];
	clusters?: ClusterDefinition[];
	manualAssignments?: Record<string, string>;
}): void {
	if (response.sessions) {
		useSessionStore.getState().setSessions(response.sessions);
	}
	if (response.pods) {
		usePodStore.getState().setPods(response.pods);
	}
	if (response.clusters) {
		useClusterStore
			.getState()
			.setClusters(response.clusters, response.manualAssignments ?? {});
	}
}

function getDerived(): DerivedClusterState {
	const pods = usePodStore.getState().pods;
	const sessions = useSessionStore.getState().sessions;
	const clusters = useClusterStore.getState().clusters;
	const manualAssignments = useClusterStore.getState().manualAssignments;
	return deriveClusterState(
		pods,
		sessions,
		clusters,
		manualAssignments,
		HOMEDIR,
	);
}

/**
 * Assert cross-store invariants that must hold after every event:
 * 1. Completeness: every pod appears in exactly one cluster or unclustered
 * 2. Exclusivity: no pod appears in multiple clusters
 * 3. Attention accuracy: cluster attention = sum of isAttentionState for sessions
 */
function assertInvariants(): void {
	const pods = usePodStore.getState().pods;
	const sessions = useSessionStore.getState().sessions;
	const derived = getDerived();

	// Collect all pod IDs from derived state
	const allDerivedPodIds = new Set<string>();
	derived.clusters.forEach((cluster) => {
		cluster.podIds.forEach((podId) => {
			expect(
				allDerivedPodIds.has(podId),
				`Exclusivity violation: pod ${podId} appears in multiple clusters`,
			).toBe(false);
			allDerivedPodIds.add(podId);
		});
	});
	derived.unclustered.podIds.forEach((podId) => {
		expect(
			allDerivedPodIds.has(podId),
			`Exclusivity violation: pod ${podId} in unclustered AND a cluster`,
		).toBe(false);
		allDerivedPodIds.add(podId);
	});

	// Completeness: every pod in the store appears in derived state
	pods.forEach((_, podId) => {
		expect(
			allDerivedPodIds.has(podId),
			`Completeness violation: pod ${podId} missing from derived state`,
		).toBe(true);
	});

	// No extra pods in derived state that don't exist in the store
	allDerivedPodIds.forEach((podId) => {
		expect(
			pods.has(podId),
			`Derived state references non-existent pod ${podId}`,
		).toBe(true);
	});

	// Attention accuracy: cluster attention = sum of isAttentionState for member sessions
	derived.clusters.forEach((cluster) => {
		let expectedAttention = 0;
		cluster.podIds.forEach((podId) => {
			const pod = pods.get(podId);
			if (!pod) {
				return;
			}
			pod.memberSessionIds.forEach((sessionId) => {
				const session = sessions.get(sessionId);
				if (session && isAttentionState(session.activity)) {
					expectedAttention += 1;
				}
			});
		});
		expect(cluster.attentionCount).toBe(expectedAttention);
	});

	// Attention accuracy for unclustered
	let expectedUnclusteredAttention = 0;
	derived.unclustered.podIds.forEach((podId) => {
		const pod = pods.get(podId);
		if (!pod) {
			return;
		}
		pod.memberSessionIds.forEach((sessionId) => {
			const session = sessions.get(sessionId);
			if (session && isAttentionState(session.activity)) {
				expectedUnclusteredAttention += 1;
			}
		});
	});
	expect(derived.unclustered.attentionCount).toBe(expectedUnclusteredAttention);
}

// --- Test setup ---

describe("cross-store consistency", () => {
	beforeEach(() => {
		useSessionStore.setState({
			sessions: new Map(),
			activityChangedAt: new Map(),
		});
		usePodStore.setState({ pods: new Map() });
		useClusterStore.setState({
			clusters: [],
			manualAssignments: {},
			loading: false,
		});
		useNavigationStore.setState({
			current: { view: "cluster", id: undefined },
		});
		useNotificationDismissStore.setState({ dismissed: new Map() });

		onConnected = vi.fn();
		dispatcher = createSSEDispatcher({
			onConnected,
		} satisfies { onConnected: () => void });

		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "debug").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// --- Session lifecycle ---

	describe("session lifecycle → cluster membership", () => {
		it("session:added with matching cwd places pod in cluster", () => {
			// Set up cluster and pod first
			const cluster = buildCluster();
			useClusterStore.getState().addCluster(cluster);
			const pod = buildPod();
			usePodStore.getState().addOrUpdatePod(pod);

			// Add session with cwd matching cluster directory
			const session = buildSession();
			simulateEvent("session:added", session);

			const derived = getDerived();
			expect(derived.clusters[0].podIds).toContain("session-1");
			expect(derived.unclustered.podIds).not.toContain("session-1");
			assertInvariants();
		});

		it("session:removed decrements attention", () => {
			const cluster = buildCluster();
			useClusterStore.getState().addCluster(cluster);

			// Pod with two members, both in attention state
			const session1 = buildSession({ sessionId: "s1", activity: "idle" });
			const session2 = buildSession({ sessionId: "s2", activity: "idle" });
			useSessionStore.getState().addSession(session1);
			useSessionStore.getState().addSession(session2);

			const pod = buildPod({
				leadSessionId: "s1",
				memberSessionIds: ["s1", "s2"],
			});
			usePodStore.getState().addOrUpdatePod(pod);

			const derivedBefore = getDerived();
			expect(derivedBefore.clusters[0].attentionCount).toBe(2);
			assertInvariants();

			// Remove one session: attention decreases
			simulateEvent("session:removed", { sessionId: "s2" });

			const derivedAfter = getDerived();
			expect(derivedAfter.clusters[0].attentionCount).toBe(1);
			assertInvariants();
		});

		it("session:updated to attention state increments attention", () => {
			const cluster = buildCluster();
			useClusterStore.getState().addCluster(cluster);

			const session = buildSession({ activity: "processing" });
			useSessionStore.getState().addSession(session);

			const pod = buildPod({
				leadSessionId: "session-1",
				memberSessionIds: ["session-1"],
			});
			usePodStore.getState().addOrUpdatePod(pod);

			const derivedBefore = getDerived();
			expect(derivedBefore.clusters[0].attentionCount).toBe(0);
			assertInvariants();

			// Update session to attention state
			simulateEvent("session:updated", { ...session, activity: "idle" });

			const derivedAfter = getDerived();
			expect(derivedAfter.clusters[0].attentionCount).toBe(1);
			assertInvariants();
		});

		it("session:updated away from attention state decrements attention", () => {
			const cluster = buildCluster();
			useClusterStore.getState().addCluster(cluster);

			const session = buildSession({ activity: "idle" });
			useSessionStore.getState().addSession(session);

			const pod = buildPod({
				leadSessionId: "session-1",
				memberSessionIds: ["session-1"],
			});
			usePodStore.getState().addOrUpdatePod(pod);

			const derivedBefore = getDerived();
			expect(derivedBefore.clusters[0].attentionCount).toBe(1);
			assertInvariants();

			// Update to non-attention state
			simulateEvent("session:updated", { ...session, activity: "processing" });

			const derivedAfter = getDerived();
			expect(derivedAfter.clusters[0].attentionCount).toBe(0);
			assertInvariants();
		});
	});

	// --- Pod lifecycle ---

	describe("pod lifecycle → cluster membership", () => {
		it("pod:formed places pod in cluster matching lead session cwd", () => {
			const cluster = buildCluster();
			useClusterStore.getState().addCluster(cluster);

			// Session must exist for assignment to work
			const session = buildSession({ sessionId: "lead-1" });
			useSessionStore.getState().addSession(session);

			simulateEvent(
				"pod:formed",
				buildPod({ leadSessionId: "lead-1", memberSessionIds: ["lead-1"] }),
			);

			const derived = getDerived();
			expect(derived.clusters[0].podIds).toContain("lead-1");
			assertInvariants();
		});

		it("pod:dissolved removes pod from cluster membership", () => {
			const cluster = buildCluster();
			useClusterStore.getState().addCluster(cluster);

			const session = buildSession({ sessionId: "lead-1" });
			useSessionStore.getState().addSession(session);

			const pod = buildPod({
				leadSessionId: "lead-1",
				memberSessionIds: ["lead-1"],
			});
			usePodStore.getState().addOrUpdatePod(pod);

			const derivedBefore = getDerived();
			expect(derivedBefore.clusters[0].podIds).toContain("lead-1");
			assertInvariants();

			simulateEvent("pod:dissolved", { leadSessionId: "lead-1" });

			const derivedAfter = getDerived();
			expect(derivedAfter.clusters[0].podIds).not.toContain("lead-1");
			assertInvariants();
		});

		it("pod:updated with new members updates attention count", () => {
			const cluster = buildCluster();
			useClusterStore.getState().addCluster(cluster);

			const session1 = buildSession({
				sessionId: "lead-1",
				activity: "processing",
			});
			const session2 = buildSession({ sessionId: "sub-1", activity: "idle" });
			useSessionStore.getState().addSession(session1);
			useSessionStore.getState().addSession(session2);

			// Initial pod with one member
			const pod = buildPod({
				leadSessionId: "lead-1",
				memberSessionIds: ["lead-1"],
			});
			usePodStore.getState().addOrUpdatePod(pod);

			const derivedBefore = getDerived();
			expect(derivedBefore.clusters[0].attentionCount).toBe(0);
			assertInvariants();

			// Pod updated: gains a member in attention state
			simulateEvent("pod:updated", {
				...pod,
				memberSessionIds: ["lead-1", "sub-1"],
			});

			const derivedAfter = getDerived();
			expect(derivedAfter.clusters[0].attentionCount).toBe(1);
			assertInvariants();
		});
	});

	// --- Cluster lifecycle ---

	describe("cluster lifecycle → membership recalculation", () => {
		it("cluster:created picks up matching pods", () => {
			// Session + pod exist before cluster
			const session = buildSession({ sessionId: "lead-1" });
			useSessionStore.getState().addSession(session);

			const pod = buildPod({
				leadSessionId: "lead-1",
				memberSessionIds: ["lead-1"],
			});
			usePodStore.getState().addOrUpdatePod(pod);

			// Initially unclustered
			const derivedBefore = getDerived();
			expect(derivedBefore.unclustered.podIds).toContain("lead-1");
			assertInvariants();

			// Create cluster whose directory matches the session cwd
			simulateEvent("cluster:created", buildCluster());

			const derivedAfter = getDerived();
			expect(derivedAfter.clusters[0].podIds).toContain("lead-1");
			expect(derivedAfter.unclustered.podIds).not.toContain("lead-1");
			assertInvariants();
		});

		it("cluster:updated with new directories moves pods between clusters", () => {
			const cluster1 = buildCluster({
				id: "c1",
				directories: [`${HOMEDIR}/projects/app`],
			});
			const cluster2 = buildCluster({
				id: "c2",
				name: "Other",
				directories: [`${HOMEDIR}/other`],
				sortOrder: 1,
			});
			useClusterStore.getState().addCluster(cluster1);
			useClusterStore.getState().addCluster(cluster2);

			const session = buildSession({
				sessionId: "lead-1",
				cwd: `${HOMEDIR}/projects/app`,
			});
			useSessionStore.getState().addSession(session);

			const pod = buildPod({
				leadSessionId: "lead-1",
				memberSessionIds: ["lead-1"],
			});
			usePodStore.getState().addOrUpdatePod(pod);

			// Pod is in cluster1 via directory match
			const derivedBefore = getDerived();
			expect(derivedBefore.clusters[0].podIds).toContain("lead-1");
			assertInvariants();

			// Update cluster1's directories to no longer match; update cluster2 to match
			simulateEvent("cluster:updated", {
				...cluster1,
				directories: [`${HOMEDIR}/elsewhere`],
			});
			simulateEvent("cluster:updated", {
				...cluster2,
				directories: [`${HOMEDIR}/projects/app`],
			});

			const derivedAfter = getDerived();
			// Pod moved from cluster1 to cluster2
			const c1Derived = derivedAfter.clusters.find(
				(c) => c.definition.id === "c1",
			);
			const c2Derived = derivedAfter.clusters.find(
				(c) => c.definition.id === "c2",
			);
			expect(c1Derived!.podIds).not.toContain("lead-1");
			expect(c2Derived!.podIds).toContain("lead-1");
			assertInvariants();
		});

		it("cluster:deleted moves pods to unclustered", () => {
			const cluster = buildCluster();
			useClusterStore.getState().addCluster(cluster);

			const session = buildSession({ sessionId: "lead-1" });
			useSessionStore.getState().addSession(session);

			const pod = buildPod({
				leadSessionId: "lead-1",
				memberSessionIds: ["lead-1"],
			});
			usePodStore.getState().addOrUpdatePod(pod);

			const derivedBefore = getDerived();
			expect(derivedBefore.clusters[0].podIds).toContain("lead-1");
			assertInvariants();

			simulateEvent("cluster:deleted", { clusterId: "cluster-1" });

			const derivedAfter = getDerived();
			expect(derivedAfter.clusters).toHaveLength(0);
			expect(derivedAfter.unclustered.podIds).toContain("lead-1");
			assertInvariants();
		});
	});

	// --- Assignment changes ---

	describe("assignment changes → immediate membership", () => {
		it("cluster:assignment-changed updates manualAssignments and moves pod", () => {
			const cluster1 = buildCluster({
				id: "c1",
				directories: [`${HOMEDIR}/projects/app`],
			});
			const cluster2 = buildCluster({
				id: "c2",
				name: "Manual",
				directories: [],
				sortOrder: 1,
			});
			useClusterStore.getState().addCluster(cluster1);
			useClusterStore.getState().addCluster(cluster2);

			const session = buildSession({ sessionId: "lead-1" });
			useSessionStore.getState().addSession(session);

			const pod = buildPod({
				leadSessionId: "lead-1",
				memberSessionIds: ["lead-1"],
			});
			usePodStore.getState().addOrUpdatePod(pod);

			// Pod initially in cluster1 via directory match
			const derivedBefore = getDerived();
			expect(derivedBefore.clusters[0].podIds).toContain("lead-1");
			assertInvariants();

			// Manual assignment overrides to cluster2
			simulateEvent("cluster:assignment-changed", {
				sessionId: "lead-1",
				clusterId: "c2",
			});

			const derivedAfter = getDerived();
			const c1After = derivedAfter.clusters.find(
				(c) => c.definition.id === "c1",
			);
			const c2After = derivedAfter.clusters.find(
				(c) => c.definition.id === "c2",
			);
			expect(c1After!.podIds).not.toContain("lead-1");
			expect(c2After!.podIds).toContain("lead-1");
			assertInvariants();
		});

		it("manual assignment overrides directory match", () => {
			const cluster1 = buildCluster({
				id: "c1",
				directories: [`${HOMEDIR}/projects/app`],
			});
			const cluster2 = buildCluster({
				id: "c2",
				name: "Override",
				directories: [],
				sortOrder: 1,
			});
			useClusterStore.getState().addCluster(cluster1);
			useClusterStore.getState().addCluster(cluster2);

			const session = buildSession({ sessionId: "s1" });
			useSessionStore.getState().addSession(session);

			const pod = buildPod({ leadSessionId: "s1", memberSessionIds: ["s1"] });
			usePodStore.getState().addOrUpdatePod(pod);

			// Manually assign to cluster2 (session cwd matches cluster1's directory)
			useClusterStore.getState().setManualAssignment("s1", "c2");

			const derived = getDerived();
			const c1 = derived.clusters.find((c) => c.definition.id === "c1");
			const c2 = derived.clusters.find((c) => c.definition.id === "c2");
			expect(c1!.podIds).not.toContain("s1");
			expect(c2!.podIds).toContain("s1");
			assertInvariants();
		});

		it("removing manual assignment falls back to directory match", () => {
			const cluster1 = buildCluster({
				id: "c1",
				directories: [`${HOMEDIR}/projects/app`],
			});
			const cluster2 = buildCluster({
				id: "c2",
				name: "Override",
				directories: [],
				sortOrder: 1,
			});
			useClusterStore.getState().addCluster(cluster1);
			useClusterStore.getState().addCluster(cluster2);

			const session = buildSession({ sessionId: "s1" });
			useSessionStore.getState().addSession(session);

			const pod = buildPod({ leadSessionId: "s1", memberSessionIds: ["s1"] });
			usePodStore.getState().addOrUpdatePod(pod);

			// Start with manual assignment to cluster2
			useClusterStore.getState().setManualAssignment("s1", "c2");

			const derivedBefore = getDerived();
			const c2Before = derivedBefore.clusters.find(
				(c) => c.definition.id === "c2",
			);
			expect(c2Before!.podIds).toContain("s1");

			// Remove manual assignment via event (null clusterId)
			simulateEvent("cluster:assignment-changed", {
				sessionId: "s1",
				clusterId: null,
			});

			// Falls back to directory match: cluster1
			const derivedAfter = getDerived();
			const c1After = derivedAfter.clusters.find(
				(c) => c.definition.id === "c1",
			);
			const c2After = derivedAfter.clusters.find(
				(c) => c.definition.id === "c2",
			);
			expect(c1After!.podIds).toContain("s1");
			expect(c2After!.podIds).not.toContain("s1");
			assertInvariants();
		});
	});

	// --- Refetch race conditions ---

	describe("refetch + SSE race conditions", () => {
		let fetchSpy: ReturnType<typeof vi.spyOn>;
		let refetch: SSERefetch;

		beforeEach(() => {
			vi.useFakeTimers();
			fetchSpy = vi.spyOn(globalThis, "fetch");
		});

		afterEach(() => {
			refetch?.dispose();
			vi.useRealTimers();
		});

		function createRefetch(): SSERefetch {
			refetch = createSSERefetch({
				baseUrl: "http://127.0.0.1:8314",
				dispatch: dispatcher.dispatch,
				debounceMs: 100,
				gatingTimeoutMs: 5000,
			});
			return refetch;
		}

		function mockSuccessfulRefetch(
			sessions: RegisteredSession[],
			pods: Pod[],
			clusters: ClusterDefinition[],
			manualAssignments: Record<string, string> = {},
		): void {
			fetchSpy.mockImplementation((url: string | URL | Request) => {
				const urlStr = typeof url === "string" ? url : url.toString();
				if (urlStr.includes("/api/sessions")) {
					return Promise.resolve(
						new Response(JSON.stringify({ sessions }), { status: 200 }),
					);
				}
				if (urlStr.includes("/api/pods")) {
					return Promise.resolve(
						new Response(JSON.stringify({ pods }), { status: 200 }),
					);
				}
				if (urlStr.includes("/api/clusters")) {
					return Promise.resolve(
						new Response(JSON.stringify({ clusters, manualAssignments }), {
							status: 200,
						}),
					);
				}
				return Promise.resolve(new Response(null, { status: 404 }));
			});
		}

		it("event during gating is replayed after refetch", async () => {
			const cluster = buildCluster();
			useClusterStore.getState().addCluster(cluster);

			const session = buildSession({ sessionId: "s1", activity: "processing" });
			useSessionStore.getState().addSession(session);

			const pod = buildPod({ leadSessionId: "s1", memberSessionIds: ["s1"] });
			usePodStore.getState().addOrUpdatePod(pod);

			const sseRefetch = createRefetch();

			// Mock refetch response
			mockSuccessfulRefetch([session], [pod], [cluster]);

			// Start refetch (enables gating)
			const refetchPromise = sseRefetch.refetchAll();
			expect(sseRefetch.isGating()).toBe(true);

			// Event arrives while gating: queued, not dispatched
			sseRefetch.queueEvent(
				"session:updated",
				JSON.stringify({ ...session, activity: "idle" }),
			);

			// Session should still show processing (event queued, not applied)
			expect(useSessionStore.getState().sessions.get("s1")!.activity).toBe(
				"processing",
			);

			// Let refetch complete
			await vi.runAllTimersAsync();
			await refetchPromise;

			// After refetch + replay, the queued event is applied
			expect(useSessionStore.getState().sessions.get("s1")!.activity).toBe(
				"idle",
			);
			assertInvariants();
		});

		it("refetch does not overwrite fresher SSE-delivered state", async () => {
			const cluster = buildCluster();
			useClusterStore.getState().addCluster(cluster);

			const session = buildSession({ sessionId: "s1", activity: "processing" });
			useSessionStore.getState().addSession(session);

			const pod = buildPod({ leadSessionId: "s1", memberSessionIds: ["s1"] });
			usePodStore.getState().addOrUpdatePod(pod);

			const sseRefetch = createRefetch();

			// Refetch returns stale "processing" state
			mockSuccessfulRefetch([session], [pod], [cluster]);

			const refetchPromise = sseRefetch.refetchAll();

			// During gating, queue an event that represents a fresher state
			sseRefetch.queueEvent(
				"session:updated",
				JSON.stringify({ ...session, activity: "idle" }),
			);

			await vi.runAllTimersAsync();
			await refetchPromise;

			// The queued event replays AFTER refetch applies, so the fresher state wins
			expect(useSessionStore.getState().sessions.get("s1")!.activity).toBe(
				"idle",
			);
			assertInvariants();
		});

		it("aborted refetch does not apply stale data", async () => {
			const cluster = buildCluster();
			useClusterStore.getState().addCluster(cluster);

			const session = buildSession({ sessionId: "s1", activity: "idle" });
			useSessionStore.getState().addSession(session);

			const pod = buildPod({ leadSessionId: "s1", memberSessionIds: ["s1"] });
			usePodStore.getState().addOrUpdatePod(pod);

			const sseRefetch = createRefetch();

			// First refetch: slow, returns stale processing state
			let firstCallResolve: (() => void) | undefined;
			const firstCallPromise = new Promise<void>((resolve) => {
				firstCallResolve = resolve;
			});

			fetchSpy.mockImplementation(
				(url: string | URL | Request, init?: RequestInit) => {
					const signal = init?.signal;
					return new Promise((resolve, reject) => {
						// Simulate slow response that checks abort
						const checkAbort = () => {
							if (signal?.aborted) {
								reject(new DOMException("Aborted", "AbortError"));
								firstCallResolve?.();
								return true;
							}
							return false;
						};

						// Check immediately, then after a delay
						if (checkAbort()) {
							return;
						}
						signal?.addEventListener("abort", () => {
							reject(new DOMException("Aborted", "AbortError"));
							firstCallResolve?.();
						});
					});
				},
			);

			// Start first refetch (never resolves naturally)
			const firstRefetch = sseRefetch.refetchAll();

			// Start second refetch (aborts the first)
			mockSuccessfulRefetch(
				[{ ...session, activity: "idle" }],
				[pod],
				[cluster],
			);
			const secondRefetch = sseRefetch.refetchAll();

			await vi.runAllTimersAsync();
			await secondRefetch;

			// The session retains the "idle" state from the second refetch
			expect(useSessionStore.getState().sessions.get("s1")!.activity).toBe(
				"idle",
			);
			assertInvariants();
		});

		it("partial failure preserves existing state", async () => {
			const cluster = buildCluster();
			useClusterStore.getState().addCluster(cluster);

			const session = buildSession({ sessionId: "s1", activity: "idle" });
			useSessionStore.getState().addSession(session);

			const pod = buildPod({ leadSessionId: "s1", memberSessionIds: ["s1"] });
			usePodStore.getState().addOrUpdatePod(pod);

			const sseRefetch = createRefetch();

			// Partial failure: sessions OK, pods fail
			fetchSpy.mockImplementation((url: string | URL | Request) => {
				const urlStr = typeof url === "string" ? url : url.toString();
				if (urlStr.includes("/api/sessions")) {
					return Promise.resolve(
						new Response(
							JSON.stringify({
								sessions: [{ ...session, activity: "processing" }],
							}),
							{ status: 200 },
						),
					);
				}
				if (urlStr.includes("/api/pods")) {
					return Promise.resolve(new Response(null, { status: 500 }));
				}
				if (urlStr.includes("/api/clusters")) {
					return Promise.resolve(
						new Response(
							JSON.stringify({ clusters: [cluster], manualAssignments: {} }),
							{ status: 200 },
						),
					);
				}
				return Promise.resolve(new Response(null, { status: 404 }));
			});

			const refetchPromise = sseRefetch.refetchAll();
			await vi.runAllTimersAsync();
			await refetchPromise;

			// State preserved: partial failure means no data applied
			expect(useSessionStore.getState().sessions.get("s1")!.activity).toBe(
				"idle",
			);
			expect(usePodStore.getState().pods.has("s1")).toBe(true);
			assertInvariants();
		});
	});

	// --- Attention consistency ---

	describe("attention consistency across views", () => {
		it("derived attention for a cluster equals what Sidebar and ClusterHeader would display", () => {
			const cluster = buildCluster();
			useClusterStore.getState().addCluster(cluster);

			// Multiple sessions in the same pod, mixed states
			const session1 = buildSession({ sessionId: "s1", activity: "idle" });
			const session2 = buildSession({
				sessionId: "s2",
				activity: "processing",
			});
			const session3 = buildSession({
				sessionId: "s3",
				activity: "pending_approval",
			});
			useSessionStore.getState().addSession(session1);
			useSessionStore.getState().addSession(session2);
			useSessionStore.getState().addSession(session3);

			const pod = buildPod({
				leadSessionId: "s1",
				memberSessionIds: ["s1", "s2", "s3"],
			});
			usePodStore.getState().addOrUpdatePod(pod);

			const derived = getDerived();
			// s1 (idle) + s3 (pending_approval) = 2 attention sessions
			const clusterDerived = derived.clusters[0];
			expect(clusterDerived.attentionCount).toBe(2);

			// This is the single source of truth: both Sidebar and ClusterHeader
			// read from the same `deriveClusterState` output, so they always agree
			assertInvariants();
		});

		it("notification bell count equals sum of visible attention sessions", () => {
			const cluster = buildCluster();
			useClusterStore.getState().addCluster(cluster);

			const session1 = buildSession({ sessionId: "s1", activity: "idle" });
			const session2 = buildSession({
				sessionId: "s2",
				activity: "pending_approval",
			});
			const session3 = buildSession({
				sessionId: "s3",
				activity: "processing",
			});
			useSessionStore.getState().addSession(session1);
			useSessionStore.getState().addSession(session2);
			useSessionStore.getState().addSession(session3);

			const pod = buildPod({
				leadSessionId: "s1",
				memberSessionIds: ["s1", "s2", "s3"],
			});
			usePodStore.getState().addOrUpdatePod(pod);

			const sessions = useSessionStore.getState().sessions;
			const activityChangedAt = useSessionStore.getState().activityChangedAt;
			const dismissed = useNotificationDismissStore.getState().dismissed;

			const bellCount = computeVisibleAttentionCount(
				sessions,
				activityChangedAt,
				dismissed,
			);
			const derived = getDerived();

			// Both should count the same sessions: s1 (idle) + s2 (pending_approval)
			const totalDerivedAttention =
				derived.clusters.reduce(
					(sum, cluster) => sum + cluster.attentionCount,
					0,
				) + derived.unclustered.attentionCount;

			expect(bellCount).toBe(totalDerivedAttention);
			assertInvariants();
		});

		it("dismiss + state change makes session visible again", () => {
			vi.useFakeTimers({ now: new Date("2025-01-01T00:00:00Z") });

			const session = buildSession({ sessionId: "s1", activity: "idle" });
			useSessionStore.getState().addSession(session);

			const activityChangedAt = useSessionStore.getState().activityChangedAt;
			const stateChangedAt = activityChangedAt.get("s1")!;

			// Dismiss the notification
			useNotificationDismissStore.getState().dismiss("s1", stateChangedAt);

			const sessions = useSessionStore.getState().sessions;
			const dismissed = useNotificationDismissStore.getState().dismissed;
			const bellCountDismissed = computeVisibleAttentionCount(
				sessions,
				activityChangedAt,
				dismissed,
			);
			expect(bellCountDismissed).toBe(0);

			// Advance time so stateChangedAt advances past the dismiss timestamp
			vi.advanceTimersByTime(1000);

			// Session transitions: processing → idle again (new stateChangedAt)
			simulateEvent("session:updated", { ...session, activity: "processing" });

			vi.advanceTimersByTime(1000);

			simulateEvent("session:updated", { ...session, activity: "idle" });

			const sessionsAfter = useSessionStore.getState().sessions;
			const activityChangedAtAfter =
				useSessionStore.getState().activityChangedAt;
			const dismissedAfter = useNotificationDismissStore.getState().dismissed;

			const bellCountAfter = computeVisibleAttentionCount(
				sessionsAfter,
				activityChangedAtAfter,
				dismissedAfter,
			);
			// Session visible again: stateChangedAt advanced past dismissal timestamp
			expect(bellCountAfter).toBe(1);
			assertInvariants();

			vi.useRealTimers();
		});
	});

	// --- Navigation reconciliation ---

	describe("navigation reconciliation", () => {
		it("pod:dissolved resets nav when viewing that pod", () => {
			const pod = buildPod({
				leadSessionId: "lead-1",
				memberSessionIds: ["lead-1"],
			});
			usePodStore.getState().addOrUpdatePod(pod);
			useNavigationStore.getState().navigateTo("pod", "lead-1");

			simulateEvent("pod:dissolved", { leadSessionId: "lead-1" });

			const { current } = useNavigationStore.getState();
			expect(current.view).toBe("cluster");
			expect(current.id).toBeUndefined();
			assertInvariants();
		});

		it("pod:dissolved is no-op for different pod", () => {
			const pod = buildPod({
				leadSessionId: "lead-1",
				memberSessionIds: ["lead-1"],
			});
			usePodStore.getState().addOrUpdatePod(pod);
			useNavigationStore.getState().navigateTo("pod", "other-pod");

			simulateEvent("pod:dissolved", { leadSessionId: "lead-1" });

			const { current } = useNavigationStore.getState();
			expect(current.view).toBe("pod");
			expect(current.id).toBe("other-pod");
			assertInvariants();
		});

		it("cluster:deleted resets nav for that cluster", () => {
			const cluster = buildCluster({ id: "c1" });
			useClusterStore.getState().addCluster(cluster);
			useNavigationStore.getState().navigateTo("cluster", "c1");

			simulateEvent("cluster:deleted", { clusterId: "c1" });

			const { current } = useNavigationStore.getState();
			expect(current.view).toBe("cluster");
			expect(current.id).toBeUndefined();
			assertInvariants();
		});
	});
});
