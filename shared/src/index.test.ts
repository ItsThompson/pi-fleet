import { describe, it, expect } from "vitest";
import {
	STATE_PRIORITY,
	ACTIVITY_STATUSES,
	SERVER_PORT,
	HEARTBEAT_INTERVAL_MS,
	REAP_TIMEOUT_MS,
	SSE_KEEPALIVE_MS,
	UNCLUSTERED_ID,
	getConfigPath,
	getConfigDir,
	getLogPath,
} from "./index.js";
import type {
	ActivityStatus,
	ContextUsagePayload,
	RegisterBody,
	HeartbeatBody,
	RegisteredSession,
	Pod,
	ClusterDefinition,
	ClusterConfig,
	PiFleetConfig,
	SSEEvent,
	OpenResult,
	OpenFailureReason,
} from "./index.js";

describe("index barrel exports", () => {
	it("exports all constants", () => {
		expect(SERVER_PORT).toBeDefined();
		expect(HEARTBEAT_INTERVAL_MS).toBeDefined();
		expect(REAP_TIMEOUT_MS).toBeDefined();
		expect(SSE_KEEPALIVE_MS).toBeDefined();
		expect(UNCLUSTERED_ID).toBe("unclustered");
	});

	it("exports STATE_PRIORITY with correct keys", () => {
		expect(STATE_PRIORITY.idle).toBe(1);
		expect(STATE_PRIORITY.running_tool).toBe(2);
		expect(STATE_PRIORITY.processing).toBe(3);
		expect(STATE_PRIORITY.pending_approval).toBe(4);
	});

	it("exports path utilities as functions", () => {
		expect(typeof getConfigPath).toBe("function");
		expect(typeof getConfigDir).toBe("function");
		expect(typeof getLogPath).toBe("function");
	});
});

describe("type contracts (compile-time verification)", () => {
	it("ACTIVITY_STATUSES is the source of truth for ActivityStatus", () => {
		const statuses: ActivityStatus[] = [...ACTIVITY_STATUSES];
		expect([...statuses].sort()).toEqual([
			"idle",
			"pending_approval",
			"processing",
			"running_tool",
		]);
	});

	it("RegisterBody satisfies required fields", () => {
		const body: RegisterBody = {
			sessionId: "abc-123",
			pid: 1234,
			cwd: "/home/user/project",
			tmuxTarget: "%0",
			startTime: new Date().toISOString(),
		};
		expect(body.sessionId).toBe("abc-123");
	});

	it("RegisterBody supports all optional fields", () => {
		const body: RegisterBody = {
			sessionId: "abc-123",
			pid: 1234,
			cwd: "/home/user/project",
			tmuxTarget: null,
			startTime: new Date().toISOString(),
			agentName: "pi",
			subagentId: "sub-1",
			model: "Claude Sonnet 4",
			contextUsage: { tokens: 5000, contextWindow: 200000, percent: 3 },
			thinkingLevel: "high",
		};
		expect(body.model).toBe("Claude Sonnet 4");
	});

	it("HeartbeatBody satisfies required fields", () => {
		const body: HeartbeatBody = {
			sessionId: "abc-123",
			activity: "processing",
			lastEventTime: new Date().toISOString(),
		};
		expect(body.activity).toBe("processing");
	});

	it("RegisteredSession includes all server-added fields", () => {
		const session: RegisteredSession = {
			sessionId: "abc-123",
			pid: 1234,
			cwd: "/home/user/project",
			tmuxTarget: "%0",
			startTime: "2025-01-01T00:00:00.000Z",
			activity: "idle",
			lastSeen: "2025-01-01T00:00:05.000Z",
			lastEventTime: "2025-01-01T00:00:04.000Z",
		};
		expect(session.activity).toBe("idle");
	});

	it("Pod type has correct shape", () => {
		const pod: Pod = {
			leadSessionId: "lead-1",
			memberSessionIds: ["lead-1", "child-1"],
			displayName: "my-project",
			state: "running_tool",
			attentionCount: 1,
		};
		expect(pod.memberSessionIds).toHaveLength(2);
	});

	it("ClusterDefinition and ClusterConfig have correct shape", () => {
		const cluster: ClusterDefinition = {
			id: "uuid-1",
			name: "Work",
			directories: ["~/workplace/"],
			sortOrder: 0,
		};
		const config: ClusterConfig = {
			version: 1,
			clusters: [cluster],
			manualAssignments: { "session-1": "uuid-1" },
		};
		expect(config.version).toBe(1);
		expect(config.clusters).toHaveLength(1);
	});

	it("PiFleetConfig has correct shape", () => {
		const config: PiFleetConfig = {
			version: 1,
			preferences: {
				ghostMode: false,
				ghostOpacity: 0.8,
				soundEnabled: true,
			},
		};
		expect(config.preferences.ghostMode).toBe(false);
	});

	it("SSEEvent discriminated union narrows correctly", () => {
		const event: SSEEvent = {
			type: "session:added",
			data: {
				sessionId: "s1",
				pid: 100,
				cwd: "/tmp",
				tmuxTarget: null,
				startTime: "2025-01-01T00:00:00Z",
				activity: "idle",
				lastSeen: "2025-01-01T00:00:00Z",
				lastEventTime: "2025-01-01T00:00:00Z",
			},
		};

		if (event.type === "session:added") {
			// Narrows to RegisteredSession
			expect(event.data.sessionId).toBe("s1");
			expect(event.data.activity).toBe("idle");
		}
	});

	it("SSEEvent covers all 13 event types", () => {
		const allTypes: SSEEvent["type"][] = [
			"session:added",
			"session:updated",
			"session:removed",
			"pod:formed",
			"pod:updated",
			"pod:dissolved",
			"cluster:created",
			"cluster:updated",
			"cluster:deleted",
			"cluster:reordered",
			"cluster:assignment-changed",
			"connected",
			"heartbeat",
		];
		expect(allTypes).toHaveLength(13);
	});

	it("OpenResult discriminates on ok field", () => {
		const success: OpenResult = { ok: true };
		const failure: OpenResult = { ok: false, reason: "no-client" };

		expect(success.ok).toBe(true);
		if (!failure.ok) {
			expect(failure.reason).toBe("no-client");
		}
	});

	it("OpenFailureReason covers all failure cases", () => {
		const reasons: OpenFailureReason[] = [
			"not-in-tmux",
			"invalid-target",
			"pane-not-found",
			"no-server",
			"no-client",
			"multi-client",
			"switch-failed",
			"activation-failed",
		];
		expect(reasons).toHaveLength(8);
	});

	it("ContextUsagePayload allows null tokens and percent", () => {
		const unknown: ContextUsagePayload = {
			tokens: null,
			contextWindow: 200000,
			percent: null,
		};
		const known: ContextUsagePayload = {
			tokens: 5000,
			contextWindow: 200000,
			percent: 3,
		};
		expect(unknown.tokens).toBeNull();
		expect(known.percent).toBe(3);
	});
});
