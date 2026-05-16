import { create } from "zustand";

export type ViewType = "cluster" | "pod" | "notifications";

export interface NavigationState {
	view: ViewType;
	id?: string;
}

interface NavigationStore {
	current: NavigationState;
	navigateTo: (view: ViewType, id?: string) => void;
	/**
	 * Reset navigation to AllPodsView if currently viewing the given entity.
	 * No-op (returns same state reference) if the current view doesn't match.
	 * Called by the SSE dispatcher on pod:dissolved and cluster:deleted.
	 */
	resetIfViewing: (view: ViewType, id: string) => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
	current: { view: "cluster", id: undefined },

	navigateTo: (view, id) => {
		set({ current: { view, id } });
	},

	resetIfViewing: (view, id) => {
		set((state) => {
			if (state.current.view === view && state.current.id === id) {
				return { current: { view: "cluster", id: undefined } };
			}
			return state;
		});
	},
}));
