import { create } from "zustand";

export type ViewType = "cluster" | "pod" | "notifications";

export interface NavigationState {
  view: ViewType;
  id?: string;
}

interface NavigationStore {
  current: NavigationState;
  navigateTo: (view: ViewType, id?: string) => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  current: { view: "cluster", id: undefined },

  navigateTo: (view, id) => {
    set({ current: { view, id } });
  },
}));
