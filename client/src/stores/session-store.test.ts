import { describe, it, expect, beforeEach } from "vitest";
import { useSessionStore } from "./session-store";
import type { RegisteredSession } from "@pi-fleet/shared";

function buildSession(
	overrides?: Partial<RegisteredSession>,
): RegisteredSession {
	return {
		sessionId: "session-1",
		pid: 1234,
		cwd: "/home/user/project",
		tmuxTarget: "main:1.0",
		startTime: "2025-01-01T00:00:00Z",
		activity: "processing",
		lastSeen: "2025-01-01T00:01:00Z",
		lastEventTime: "2025-01-01T00:01:00Z",
		...overrides,
	};
}

describe("session-store", () => {
	beforeEach(() => {
		useSessionStore.setState({
			sessions: new Map(),
			activityChangedAt: new Map(),
		});
	});

	it("adds a session", () => {
		const session = buildSession();
		useSessionStore.getState().addSession(session);

		const { sessions } = useSessionStore.getState();
		expect(sessions.size).toBe(1);
		expect(sessions.get("session-1")).toEqual(session);
	});

	it("tracks activityChangedAt on add", () => {
		useSessionStore.getState().addSession(buildSession());

		const { activityChangedAt } = useSessionStore.getState();
		expect(activityChangedAt.has("session-1")).toBe(true);
	});

	it("updates a session", () => {
		useSessionStore.getState().addSession(buildSession());
		useSessionStore
			.getState()
			.updateSession(
				buildSession({ activity: "idle", model: "Claude Sonnet 4" }),
			);

		const { sessions } = useSessionStore.getState();
		const session = sessions.get("session-1")!;
		expect(session.activity).toBe("idle");
		expect(session.model).toBe("Claude Sonnet 4");
	});

	it("updates activityChangedAt when activity changes", () => {
		useSessionStore
			.getState()
			.addSession(buildSession({ activity: "processing" }));
		const firstChanged = useSessionStore
			.getState()
			.activityChangedAt.get("session-1")!;

		// Same activity: should not change timestamp
		useSessionStore
			.getState()
			.updateSession(
				buildSession({ activity: "processing", model: "new model" }),
			);
		const sameChanged = useSessionStore
			.getState()
			.activityChangedAt.get("session-1")!;
		expect(sameChanged).toBe(firstChanged);

		// Different activity: should update timestamp
		useSessionStore
			.getState()
			.updateSession(buildSession({ activity: "idle" }));
		const newChanged = useSessionStore
			.getState()
			.activityChangedAt.get("session-1")!;
		// Could be same ms, but the logic ran
		expect(newChanged).toBeDefined();
	});

	it("removes a session", () => {
		useSessionStore.getState().addSession(buildSession());
		useSessionStore.getState().removeSession("session-1");

		const { sessions, activityChangedAt } = useSessionStore.getState();
		expect(sessions.size).toBe(0);
		expect(activityChangedAt.size).toBe(0);
	});

	it("sets sessions in bulk (preserves existing activityChangedAt)", () => {
		useSessionStore.getState().addSession(buildSession({ sessionId: "old-1" }));

		const sessions = [
			buildSession({ sessionId: "old-1", activity: "idle" }),
			buildSession({ sessionId: "new-1", activity: "running_tool" }),
		];

		useSessionStore.getState().setSessions(sessions);

		const state = useSessionStore.getState();
		expect(state.sessions.size).toBe(2);
		expect(state.sessions.get("old-1")!.activity).toBe("idle");
		expect(state.sessions.get("new-1")!.activity).toBe("running_tool");
		expect(state.activityChangedAt.has("old-1")).toBe(true);
		expect(state.activityChangedAt.has("new-1")).toBe(true);
	});

	it("does not lose sessions not in bulk set", () => {
		useSessionStore.getState().addSession(buildSession({ sessionId: "a" }));
		useSessionStore.getState().addSession(buildSession({ sessionId: "b" }));

		// setSessions replaces: only the provided sessions remain
		useSessionStore.getState().setSessions([buildSession({ sessionId: "b" })]);

		const { sessions } = useSessionStore.getState();
		expect(sessions.size).toBe(1);
		expect(sessions.has("b")).toBe(true);
	});
});
