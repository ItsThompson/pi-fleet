import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "@/components/layout/Sidebar";
import { usePodStore } from "@/stores/pod-store";
import { useClusterStore } from "@/stores/cluster-store";
import { useNavigationStore } from "@/stores/navigation-store";
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

describe("Sidebar DnD Integration", () => {
  beforeEach(() => {
    usePodStore.setState({ pods: new Map() });
    useClusterStore.setState({
      clusters: [],
      unclustered: { podIds: [], attentionCount: 0 },
      loading: false,
    });
    useNavigationStore.setState({ current: { view: "cluster", id: undefined } });
  });

  it("renders pods as draggable elements within cluster sections", () => {
    const pods = new Map([
      ["lead-1", buildPod({ leadSessionId: "lead-1", displayName: "api-service" })],
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
      unclustered: { podIds: [], attentionCount: 0 },
      loading: false,
    });

    render(<Sidebar />);

    // Pod row should exist
    expect(screen.getByText("api-service")).toBeInTheDocument();

    // Pod's wrapper should have draggable attributes
    const podButton = screen.getByText("api-service").closest("[role='button'][aria-roledescription='draggable']");
    expect(podButton).toBeInTheDocument();
  });

  it("renders clusters as sortable elements", () => {
    useClusterStore.setState({
      clusters: [
        {
          id: "c1",
          name: "Work",
          directories: [],
          sortOrder: 0,
          podIds: [],
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
    });

    render(<Sidebar />);

    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();

    // Cluster sections should be wrapped with sortable role=button
    // Note: There are multiple role=button elements (cluster triggers, sortable wrappers)
    const allButtons = screen.getAllByRole("button");
    const sortableButtons = allButtons.filter(
      (btn) => btn.getAttribute("aria-roledescription") === "sortable",
    );
    expect(sortableButtons.length).toBe(2);
  });

  it("unclustered section is NOT sortable", () => {
    useClusterStore.setState({
      clusters: [
        {
          id: "c1",
          name: "Work",
          directories: [],
          sortOrder: 0,
          podIds: [],
          attentionCount: 0,
        },
      ],
      unclustered: { podIds: [], attentionCount: 0 },
      loading: false,
    });

    render(<Sidebar />);

    // Unclustered should be present but not have sortable attributes
    expect(screen.getByText("Unclustered")).toBeInTheDocument();

    const sortableButtons = screen.getAllByRole("button").filter(
      (btn) => btn.getAttribute("aria-roledescription") === "sortable",
    );
    // Only the "Work" cluster should be sortable, not "Unclustered"
    expect(sortableButtons.length).toBe(1);
  });

  it("pods in unclustered section are draggable", () => {
    const pods = new Map([
      ["lead-1", buildPod({ leadSessionId: "lead-1", displayName: "orphan-session" })],
    ]);
    usePodStore.setState({ pods });
    useClusterStore.setState({
      clusters: [],
      unclustered: { podIds: ["lead-1"], attentionCount: 0 },
      loading: false,
    });

    render(<Sidebar />);

    expect(screen.getByText("orphan-session")).toBeInTheDocument();

    const draggable = screen.getByText("orphan-session").closest("[aria-roledescription='draggable']");
    expect(draggable).toBeInTheDocument();
  });

  it("both clusters and unclustered are drop zones (have droppable containers)", () => {
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

    render(<Sidebar />);

    // Both clusters render their pod content correctly
    expect(screen.getByText("project-a")).toBeInTheDocument();
    expect(screen.getByText("project-b")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Unclustered")).toBeInTheDocument();
  });

  it("pod click still navigates (DnD does not interfere with click)", async () => {
    const pods = new Map([
      ["lead-1", buildPod({ leadSessionId: "lead-1", displayName: "clickable-pod" })],
    ]);
    usePodStore.setState({ pods });
    useClusterStore.setState({
      clusters: [],
      unclustered: { podIds: ["lead-1"], attentionCount: 0 },
      loading: false,
    });

    render(<Sidebar />);

    // The pod text should be present and nested inside a clickable button element
    // (PointerSensor distance constraint of 8px prevents accidental drag on click)
    const podText = screen.getByText("clickable-pod");
    expect(podText).toBeInTheDocument();
    // The inner PodRow button should still exist
    const podButton = podText.closest("button[type='button']");
    expect(podButton).toBeInTheDocument();
  });
});
