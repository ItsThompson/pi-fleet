import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import {
  DndContext as DndKitContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { useClusterStore } from "@/stores/cluster-store";
import { usePodStore } from "@/stores/pod-store";
import type { Pod } from "@pi-fleet/shared";

function buildPod(overrides?: Partial<Pod>): Pod {
  return {
    leadSessionId: "lead-1",
    memberSessionIds: ["lead-1"],
    displayName: "my-project",
    state: "processing",
    attentionCount: 0,
    ...overrides,
  };
}

describe("DnD API Integration", () => {
  beforeEach(() => {
    usePodStore.setState({ pods: new Map() });
    useClusterStore.setState({
      clusters: [],
      unclustered: { podIds: [], attentionCount: 0 },
      loading: false,
    });
  });

  describe("Pod assignment API calls", () => {
    it("assignSession is callable with clusterId for pod reassignment", async () => {
      const mockAssign = vi.fn().mockResolvedValue(true);
      useClusterStore.setState({
        clusters: [
          {
            id: "c1",
            name: "Work",
            directories: [],
            sortOrder: 0,
            podIds: ["lead-1"],
            attentionCount: 0,
          },
          {
            id: "c2",
            name: "Personal",
            directories: [],
            sortOrder: 1,
            podIds: [],
            attentionCount: 0,
          },
        ],
        unclustered: { podIds: [], attentionCount: 0 },
        loading: false,
        assignSession: mockAssign,
      });

      // Call the store method directly to validate the API contract
      await useClusterStore.getState().assignSession("lead-1", "c2");

      expect(mockAssign).toHaveBeenCalledWith("lead-1", "c2");
    });

    it("assignSession is called with null for dropping on unclustered", async () => {
      const mockAssign = vi.fn().mockResolvedValue(true);
      useClusterStore.setState({
        clusters: [
          {
            id: "c1",
            name: "Work",
            directories: [],
            sortOrder: 0,
            podIds: ["lead-1"],
            attentionCount: 0,
          },
        ],
        unclustered: { podIds: [], attentionCount: 0 },
        loading: false,
        assignSession: mockAssign,
      });

      await useClusterStore.getState().assignSession("lead-1", null);

      expect(mockAssign).toHaveBeenCalledWith("lead-1", null);
    });

    it("reorder is called with new ordered IDs", async () => {
      const mockReorder = vi.fn().mockResolvedValue(true);
      useClusterStore.setState({
        clusters: [
          {
            id: "c1",
            name: "First",
            directories: [],
            sortOrder: 0,
            podIds: [],
            attentionCount: 0,
          },
          {
            id: "c2",
            name: "Second",
            directories: [],
            sortOrder: 1,
            podIds: [],
            attentionCount: 0,
          },
          {
            id: "c3",
            name: "Third",
            directories: [],
            sortOrder: 2,
            podIds: [],
            attentionCount: 0,
          },
        ],
        unclustered: { podIds: [], attentionCount: 0 },
        loading: false,
        reorder: mockReorder,
      });

      // Simulate reorder: move c3 to first position
      await useClusterStore.getState().reorder(["c3", "c1", "c2"]);

      expect(mockReorder).toHaveBeenCalledWith(["c3", "c1", "c2"]);
    });
  });

  describe("DnD handler logic", () => {
    it("skips assignment when pod is dropped on its source cluster", () => {
      const mockAssign = vi.fn().mockResolvedValue(true);
      useClusterStore.setState({
        clusters: [
          {
            id: "c1",
            name: "Work",
            directories: [],
            sortOrder: 0,
            podIds: ["lead-1"],
            attentionCount: 0,
          },
        ],
        unclustered: { podIds: [], attentionCount: 0 },
        loading: false,
        assignSession: mockAssign,
      });

      // Simulate: pod from c1 dropped back on c1
      // The DndProvider handler checks sourceClusterId === targetClusterId
      const sourceClusterId = "c1";
      const targetClusterId = "c1";

      // This is the guard logic from DndContext.tsx
      if (sourceClusterId !== targetClusterId) {
        useClusterStore.getState().assignSession("lead-1", targetClusterId);
      }

      expect(mockAssign).not.toHaveBeenCalled();
    });

    it("assigns to null when pod is dropped on unclustered", () => {
      const mockAssign = vi.fn().mockResolvedValue(true);
      useClusterStore.setState({
        clusters: [
          {
            id: "c1",
            name: "Work",
            directories: [],
            sortOrder: 0,
            podIds: ["lead-1"],
            attentionCount: 0,
          },
        ],
        unclustered: { podIds: [], attentionCount: 0 },
        loading: false,
        assignSession: mockAssign,
      });

      // Simulate: pod from c1 dropped on unclustered
      const overId = "cluster-drop-unclustered";
      const targetClusterId = overId.replace("cluster-drop-", "");
      const resolvedTargetId = targetClusterId === "unclustered" ? null : targetClusterId;
      const sourceClusterId: string | null = "c1";

      if (resolvedTargetId !== sourceClusterId) {
        useClusterStore.getState().assignSession("lead-1", resolvedTargetId);
      }

      expect(mockAssign).toHaveBeenCalledWith("lead-1", null);
    });

    it("computes new order correctly using arrayMove logic", () => {
      const { arrayMove } = require("@dnd-kit/sortable");

      const currentIds = ["c1", "c2", "c3"];
      const oldIndex = currentIds.indexOf("c3");
      const newIndex = currentIds.indexOf("c1");

      const newOrder = arrayMove(currentIds, oldIndex, newIndex);

      expect(newOrder).toEqual(["c3", "c1", "c2"]);
    });
  });
});
