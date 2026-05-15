import { create } from "zustand";
import type { Pod } from "@pi-fleet/shared";

interface PodStore {
  pods: Map<string, Pod>;

  addOrUpdatePod: (pod: Pod) => void;
  removePod: (leadSessionId: string) => void;
  setPods: (pods: Pod[]) => void;
}

export const usePodStore = create<PodStore>((set) => ({
  pods: new Map(),

  addOrUpdatePod: (pod) => {
    set((state) => {
      const next = new Map(state.pods);
      next.set(pod.leadSessionId, pod);
      return { pods: next };
    });
  },

  removePod: (leadSessionId) => {
    set((state) => {
      const next = new Map(state.pods);
      next.delete(leadSessionId);
      return { pods: next };
    });
  },

  setPods: (pods) => {
    const next = new Map<string, Pod>();
    pods.forEach((pod) => {
      next.set(pod.leadSessionId, pod);
    });
    set({ pods: next });
  },
}));
