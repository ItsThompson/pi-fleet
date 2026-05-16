import { create } from "zustand";

export interface DismissedNotification {
	dismissedStateChangedAt: string;
}

interface NotificationDismissStore {
	/** Map of sessionId → DismissedNotification with the timestamp at dismissal */
	dismissed: Map<string, DismissedNotification>;

	/** Dismiss a single notification by session ID and its current stateChangedAt */
	dismiss: (sessionId: string, stateChangedAt: string) => void;

	/** Dismiss all entries currently visible */
	dismissAll: (
		entries: Array<{ sessionId: string; stateChangedAt: string }>,
	) => void;

	/** Check if a session is still effectively dismissed (hasn't cycled since dismissal) */
	isDismissed: (sessionId: string, currentStateChangedAt: string) => boolean;
}

export const useNotificationDismissStore = create<NotificationDismissStore>(
	(set, get) => ({
		dismissed: new Map(),

		dismiss: (sessionId, stateChangedAt) => {
			set((state) => {
				const next = new Map(state.dismissed);
				next.set(sessionId, { dismissedStateChangedAt: stateChangedAt });
				return { dismissed: next };
			});
		},

		dismissAll: (entries) => {
			set((state) => {
				const next = new Map(state.dismissed);
				entries.forEach((entry) => {
					next.set(entry.sessionId, {
						dismissedStateChangedAt: entry.stateChangedAt,
					});
				});
				return { dismissed: next };
			});
		},

		isDismissed: (sessionId, currentStateChangedAt) => {
			const { dismissed } = get();
			const record = dismissed.get(sessionId);
			if (!record) return false;
			// Session is still dismissed if its current state timestamp hasn't advanced
			return currentStateChangedAt <= record.dismissedStateChangedAt;
		},
	}),
);
