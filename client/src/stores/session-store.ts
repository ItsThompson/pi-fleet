import { create } from "zustand";
import type { RegisteredSession } from "@pi-fleet/shared";

interface SessionStore {
	sessions: Map<string, RegisteredSession>;
	/** Tracks when each session's activity last changed (client-side) */
	activityChangedAt: Map<string, string>;

	addSession: (session: RegisteredSession) => void;
	updateSession: (session: RegisteredSession) => void;
	removeSession: (sessionId: string) => void;
	setSessions: (sessions: RegisteredSession[]) => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
	sessions: new Map(),
	activityChangedAt: new Map(),

	addSession: (session) => {
		set((state) => {
			const next = new Map(state.sessions);
			next.set(session.sessionId, session);
			const nextChanged = new Map(state.activityChangedAt);
			nextChanged.set(session.sessionId, new Date().toISOString());
			return { sessions: next, activityChangedAt: nextChanged };
		});
	},

	updateSession: (session) => {
		set((state) => {
			const existing = state.sessions.get(session.sessionId);
			const next = new Map(state.sessions);
			next.set(session.sessionId, session);

			const nextChanged = new Map(state.activityChangedAt);
			if (existing && existing.activity !== session.activity) {
				nextChanged.set(session.sessionId, new Date().toISOString());
			}

			return { sessions: next, activityChangedAt: nextChanged };
		});
	},

	removeSession: (sessionId) => {
		set((state) => {
			const next = new Map(state.sessions);
			next.delete(sessionId);
			const nextChanged = new Map(state.activityChangedAt);
			nextChanged.delete(sessionId);
			return { sessions: next, activityChangedAt: nextChanged };
		});
	},

	setSessions: (sessions) => {
		const now = new Date().toISOString();
		const existingMap = get().sessions;
		const existingChanged = get().activityChangedAt;

		const next = new Map<string, RegisteredSession>();
		const nextChanged = new Map<string, string>();

		sessions.forEach((session) => {
			next.set(session.sessionId, session);
			// Preserve existing activityChangedAt if we have it
			const existing = existingChanged.get(session.sessionId);
			nextChanged.set(session.sessionId, existing ?? now);
		});

		set({ sessions: next, activityChangedAt: nextChanged });
	},
}));
