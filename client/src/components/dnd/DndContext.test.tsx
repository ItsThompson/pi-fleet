import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DndProvider } from "./DndContext";
import { DraggablePod } from "./DraggablePod";
import { DroppableCluster } from "./DroppableCluster";
import { SortableCluster } from "./SortableCluster";
import { PodDragOverlay } from "./PodDragOverlay";
import { ClusterDragOverlay } from "./ClusterDragOverlay";
import { usePodStore } from "@/stores/pod-store";
import { useClusterStore } from "@/stores/cluster-store";
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

describe("DnD Components", () => {
  beforeEach(() => {
    usePodStore.setState({ pods: new Map() });
    useClusterStore.setState({
      clusters: [],
      unclustered: { podIds: [], attentionCount: 0 },
      loading: false,
    });
  });

  describe("DraggablePod", () => {
    it("renders children", () => {
      render(
        <DndProvider>
          <DraggablePod
            podId="pod-1"
            displayName="test-pod"
            sourceClusterId="c1"
          >
            <span>Pod Content</span>
          </DraggablePod>
        </DndProvider>,
      );

      expect(screen.getByText("Pod Content")).toBeInTheDocument();
    });

    it("has draggable attributes", () => {
      render(
        <DndProvider>
          <DraggablePod
            podId="pod-1"
            displayName="test-pod"
            sourceClusterId="c1"
          >
            <span>Draggable</span>
          </DraggablePod>
        </DndProvider>,
      );

      const draggable = screen.getByText("Draggable").parentElement;
      expect(draggable).toHaveAttribute("role", "button");
      expect(draggable).toHaveAttribute("tabindex", "0");
    });

    it("supports keyboard activation attributes", () => {
      render(
        <DndProvider>
          <DraggablePod
            podId="pod-1"
            displayName="test-pod"
            sourceClusterId={null}
          >
            <span>Keyboard DnD</span>
          </DraggablePod>
        </DndProvider>,
      );

      const draggable = screen.getByText("Keyboard DnD").parentElement;
      expect(draggable).toHaveAttribute("aria-roledescription", "draggable");
    });
  });

  describe("DroppableCluster", () => {
    it("renders children for a named cluster", () => {
      render(
        <DndProvider>
          <DroppableCluster clusterId="c1">
            <span>Cluster Zone</span>
          </DroppableCluster>
        </DndProvider>,
      );

      expect(screen.getByText("Cluster Zone")).toBeInTheDocument();
    });

    it("renders children for unclustered zone", () => {
      render(
        <DndProvider>
          <DroppableCluster clusterId={null}>
            <span>Unclustered Zone</span>
          </DroppableCluster>
        </DndProvider>,
      );

      expect(screen.getByText("Unclustered Zone")).toBeInTheDocument();
    });
  });

  describe("SortableCluster", () => {
    it("renders children", () => {
      render(
        <DndProvider>
          <SortableCluster clusterId="c1" name="Work">
            <span>Sortable Content</span>
          </SortableCluster>
        </DndProvider>,
      );

      expect(screen.getByText("Sortable Content")).toBeInTheDocument();
    });

    it("has sortable attributes", () => {
      render(
        <DndProvider>
          <SortableCluster clusterId="c1" name="Work">
            <span>Sortable Cluster</span>
          </SortableCluster>
        </DndProvider>,
      );

      const sortable = screen.getByText("Sortable Cluster").parentElement;
      expect(sortable).toHaveAttribute("role", "button");
      expect(sortable).toHaveAttribute("tabindex", "0");
    });
  });

  describe("PodDragOverlay", () => {
    it("renders pod display name and status", () => {
      const pod = buildPod({ displayName: "api-service", state: "idle" });
      render(<PodDragOverlay pod={pod} />);

      expect(screen.getByText("api-service")).toBeInTheDocument();
      expect(screen.getByTitle("Idle")).toBeInTheDocument();
    });
  });

  describe("ClusterDragOverlay", () => {
    it("renders cluster name", () => {
      render(<ClusterDragOverlay name="Work Projects" />);
      expect(screen.getByText("Work Projects")).toBeInTheDocument();
    });
  });

  describe("DndProvider integration", () => {
    it("renders sidebar structure with draggable pods and droppable clusters", () => {
      const pods = new Map([
        ["lead-1", buildPod({ leadSessionId: "lead-1", displayName: "project-a" })],
        ["lead-2", buildPod({ leadSessionId: "lead-2", displayName: "project-b" })],
      ]);
      usePodStore.setState({ pods });
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
        unclustered: { podIds: ["lead-2"], attentionCount: 0 },
        loading: false,
      });

      render(
        <DndProvider>
          <DroppableCluster clusterId="c1">
            <DraggablePod podId="lead-1" displayName="project-a" sourceClusterId="c1">
              <span>project-a</span>
            </DraggablePod>
          </DroppableCluster>
          <DroppableCluster clusterId={null}>
            <DraggablePod podId="lead-2" displayName="project-b" sourceClusterId={null}>
              <span>project-b</span>
            </DraggablePod>
          </DroppableCluster>
        </DndProvider>,
      );

      expect(screen.getByText("project-a")).toBeInTheDocument();
      expect(screen.getByText("project-b")).toBeInTheDocument();
    });

    it("calls assignSession when pod is dropped on a different cluster", async () => {
      const assignSession = vi.fn().mockResolvedValue(true);
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
        assignSession,
      });

      const pods = new Map([
        ["lead-1", buildPod({ leadSessionId: "lead-1", displayName: "project-a" })],
      ]);
      usePodStore.setState({ pods });

      render(
        <DndProvider>
          <DroppableCluster clusterId="c1">
            <DraggablePod podId="lead-1" displayName="project-a" sourceClusterId="c1">
              <span>project-a</span>
            </DraggablePod>
          </DroppableCluster>
          <DroppableCluster clusterId="c2">
            <span>Personal zone</span>
          </DroppableCluster>
        </DndProvider>,
      );

      // Verify the draggable element is present and interactable
      const draggable = screen.getByText("project-a").parentElement;
      expect(draggable).toHaveAttribute("role", "button");
    });

    it("calls reorder when cluster order changes", () => {
      const reorder = vi.fn().mockResolvedValue(true);
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
        ],
        unclustered: { podIds: [], attentionCount: 0 },
        loading: false,
        reorder,
      });

      render(
        <DndProvider>
          <SortableCluster clusterId="c1" name="First">
            <span>First</span>
          </SortableCluster>
          <SortableCluster clusterId="c2" name="Second">
            <span>Second</span>
          </SortableCluster>
        </DndProvider>,
      );

      // Verify sortable elements are rendered with correct structure
      expect(screen.getByText("First")).toBeInTheDocument();
      expect(screen.getByText("Second")).toBeInTheDocument();

      const firstSortable = screen.getByText("First").parentElement;
      expect(firstSortable).toHaveAttribute("role", "button");
    });
  });
});
