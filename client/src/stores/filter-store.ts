import { create } from "zustand";
import type { ActivityStatus, Pod, RegisteredSession } from "@pi-fleet/shared";

interface FilterStore {
	/** Active state filters (empty = show all) */
	activeFilters: Set<ActivityStatus>;

	/** Toggle a filter on/off */
	toggleFilter: (status: ActivityStatus) => void;

	/** Clear all filters */
	clearFilters: () => void;

	/** Check if a session passes current filters */
	passesFilter: (session: RegisteredSession) => boolean;

	/** Check if a pod passes current filters (any member matches) */
	podPassesFilter: (
		pod: Pod,
		sessions: Map<string, RegisteredSession>,
	) => boolean;
}

export const useFilterStore = create<FilterStore>((set, get) => ({
	activeFilters: new Set(),

	toggleFilter: (status) => {
		set((state) => {
			const next = new Set(state.activeFilters);
			if (next.has(status)) {
				next.delete(status);
			} else {
				next.add(status);
			}
			return { activeFilters: next };
		});
	},

	clearFilters: () => {
		set({ activeFilters: new Set() });
	},

	passesFilter: (session) => {
		const { activeFilters } = get();
		if (activeFilters.size === 0) return true;
		return activeFilters.has(session.activity);
	},

	podPassesFilter: (pod, sessions) => {
		const { activeFilters } = get();
		if (activeFilters.size === 0) return true;

		return pod.memberSessionIds.some((id) => {
			const session = sessions.get(id);
			if (!session) return false;
			return activeFilters.has(session.activity);
		});
	},
}));
