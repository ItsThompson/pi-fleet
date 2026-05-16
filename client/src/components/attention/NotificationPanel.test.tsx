import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotificationPanel } from "./NotificationPanel";
import { useSessionStore } from "@/stores/session-store";
import { usePodStore } from "@/stores/pod-store";
import { useClusterStore } from "@/stores/cluster-store";
import { useNotificationDismissStore } from "@/stores/notification-dismiss-store";
import type { RegisteredSession, Pod } from "@pi-fleet/shared";

function buildSession(overrides?: Partial<RegisteredSession>): RegisteredSession {
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

function buildPod(overrides?: Partial<Pod>): Pod {
  return {
    leadSessionId: "session-1",
    memberSessionIds: ["session-1"],
    displayName: "Test Pod",
    state: "processing",
    attentionCount: 0,
    ...overrides,
  };
}

describe("NotificationPanel", () => {
  beforeEach(() => {
    useSessionStore.setState({
      sessions: new Map(),
      activityChangedAt: new Map(),
    });
    usePodStore.setState({ pods: new Map() });
    useClusterStore.setState({ clusters: [], unclustered: { podIds: [], attentionCount: 0 } });
    useNotificationDismissStore.setState({ dismissed: new Map() });
  });

  it("renders empty state when no sessions need attention", () => {
    const sessions = new Map([
      ["session-1", buildSession({ activity: "processing" })],
    ]);
    useSessionStore.setState({ sessions, activityChangedAt: new Map([["session-1", "2025-01-01T00:00:00Z"]]) });

    render(<NotificationPanel onClose={() => {}} />);

    expect(screen.getByText("No sessions need attention")).toBeInTheDocument();
    expect(screen.getByText("Notifications (0)")).toBeInTheDocument();
  });

  it("renders entries for sessions needing attention", () => {
    const sessions = new Map([
      ["session-1", buildSession({ sessionId: "session-1", activity: "pending_approval", agentName: "refactor-agent" })],
      ["session-2", buildSession({ sessionId: "session-2", activity: "idle", agentName: "test-runner" })],
      ["session-3", buildSession({ sessionId: "session-3", activity: "processing", agentName: "builder" })],
    ]);
    const pods = new Map([
      ["session-1", buildPod({ leadSessionId: "session-1", memberSessionIds: ["session-1"], displayName: "Refactor" })],
      ["session-2", buildPod({ leadSessionId: "session-2", memberSessionIds: ["session-2"], displayName: "Tests" })],
    ]);
    const activityChangedAt = new Map([
      ["session-1", "2025-01-01T00:02:00Z"],
      ["session-2", "2025-01-01T00:01:00Z"],
      ["session-3", "2025-01-01T00:00:00Z"],
    ]);

    useSessionStore.setState({ sessions, activityChangedAt });
    usePodStore.setState({ pods });

    render(<NotificationPanel onClose={() => {}} />);

    expect(screen.getByText("Notifications (2)")).toBeInTheDocument();
    expect(screen.getByText("refactor-agent")).toBeInTheDocument();
    expect(screen.getByText("test-runner")).toBeInTheDocument();
    // processing session should NOT appear
    expect(screen.queryByText("builder")).not.toBeInTheDocument();
  });

  it("renders entries in reverse-chronological order", () => {
    const sessions = new Map([
      ["session-1", buildSession({ sessionId: "session-1", activity: "idle", agentName: "older-session" })],
      ["session-2", buildSession({ sessionId: "session-2", activity: "pending_approval", agentName: "newer-session" })],
    ]);
    const activityChangedAt = new Map([
      ["session-1", "2025-01-01T00:01:00Z"],
      ["session-2", "2025-01-01T00:05:00Z"],
    ]);

    useSessionStore.setState({ sessions, activityChangedAt });

    render(<NotificationPanel onClose={() => {}} />);

    const entries = screen.getAllByText(/session/);
    // "newer-session" should appear before "older-session"
    const newerIndex = entries.findIndex((el) => el.textContent === "newer-session");
    const olderIndex = entries.findIndex((el) => el.textContent === "older-session");
    expect(newerIndex).toBeLessThan(olderIndex);
  });

  it("Open button triggers IPC via piFleet bridge", () => {
    const mockOpenSession = vi.fn().mockResolvedValue({ ok: true });
    window.piFleet = {
      openSession: mockOpenSession,
      getConfig: vi.fn(),
      setConfig: vi.fn(),
      onVisibilityChange: vi.fn(),
      getServerUrl: vi.fn(() => ""),
      getVersion: vi.fn(() => "1.0.0"),
    };

    const sessions = new Map([
      ["session-1", buildSession({ sessionId: "session-1", activity: "idle", agentName: "my-agent" })],
    ]);
    const activityChangedAt = new Map([["session-1", "2025-01-01T00:00:00Z"]]);

    useSessionStore.setState({ sessions, activityChangedAt });

    render(<NotificationPanel onClose={() => {}} />);

    const openButton = screen.getByRole("button", { name: /open/i });
    fireEvent.click(openButton);

    expect(mockOpenSession).toHaveBeenCalledWith("session-1");

    // Cleanup
    delete window.piFleet;
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(<NotificationPanel onClose={onClose} />);

    const closeButton = screen.getByRole("button", { name: /close notifications/i });
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("displays cluster name for sessions in a cluster", () => {
    const sessions = new Map([
      ["session-1", buildSession({ sessionId: "session-1", activity: "idle", agentName: "clustered-agent" })],
    ]);
    const pods = new Map([
      ["pod-lead", buildPod({ leadSessionId: "pod-lead", memberSessionIds: ["session-1"], displayName: "My Pod" })],
    ]);
    const activityChangedAt = new Map([["session-1", "2025-01-01T00:01:00Z"]]);

    useSessionStore.setState({ sessions, activityChangedAt });
    usePodStore.setState({ pods });
    useClusterStore.setState({
      clusters: [{
        id: "c1",
        name: "Work",
        directories: [],
        sortOrder: 0,
        podIds: ["pod-lead"],
        attentionCount: 1,
      }],
      unclustered: { podIds: [], attentionCount: 0 },
    });

    render(<NotificationPanel onClose={() => {}} />);

    expect(screen.getByText(/Cluster: Work/)).toBeInTheDocument();
  });

  describe("dismiss notifications", () => {
    it("removes a notification when dismiss button is clicked", () => {
      const sessions = new Map([
        ["session-1", buildSession({ sessionId: "session-1", activity: "idle", agentName: "agent-1" })],
        ["session-2", buildSession({ sessionId: "session-2", activity: "pending_approval", agentName: "agent-2" })],
        ["session-3", buildSession({ sessionId: "session-3", activity: "idle", agentName: "agent-3" })],
      ]);
      const activityChangedAt = new Map([
        ["session-1", "2025-01-01T00:01:00Z"],
        ["session-2", "2025-01-01T00:02:00Z"],
        ["session-3", "2025-01-01T00:03:00Z"],
      ]);

      useSessionStore.setState({ sessions, activityChangedAt });

      render(<NotificationPanel onClose={() => {}} />);

      expect(screen.getByText("Notifications (3)")).toBeInTheDocument();

      const dismissButtons = screen.getAllByRole("button", { name: /dismiss notification/i });
      // Click dismiss on the second item (agent-2)
      fireEvent.click(dismissButtons[1]);

      expect(screen.getByText("Notifications (2)")).toBeInTheDocument();
      expect(screen.queryByText("agent-2")).not.toBeInTheDocument();
      expect(screen.getByText("agent-1")).toBeInTheDocument();
      expect(screen.getByText("agent-3")).toBeInTheDocument();
    });

    it("removes all notifications when Clear all is clicked", () => {
      const sessions = new Map([
        ["session-1", buildSession({ sessionId: "session-1", activity: "idle", agentName: "agent-1" })],
        ["session-2", buildSession({ sessionId: "session-2", activity: "pending_approval", agentName: "agent-2" })],
      ]);
      const activityChangedAt = new Map([
        ["session-1", "2025-01-01T00:01:00Z"],
        ["session-2", "2025-01-01T00:02:00Z"],
      ]);

      useSessionStore.setState({ sessions, activityChangedAt });

      render(<NotificationPanel onClose={() => {}} />);

      expect(screen.getByText("Notifications (2)")).toBeInTheDocument();

      const clearAllButton = screen.getByRole("button", { name: /clear all/i });
      fireEvent.click(clearAllButton);

      expect(screen.getByText("Notifications (0)")).toBeInTheDocument();
      expect(screen.getByText("No sessions need attention")).toBeInTheDocument();
    });

    it("does not show Clear all button when no entries are visible", () => {
      render(<NotificationPanel onClose={() => {}} />);

      expect(screen.queryByRole("button", { name: /clear all/i })).not.toBeInTheDocument();
    });

    it("re-shows a dismissed notification after session cycles", () => {
      const sessions = new Map([
        ["session-1", buildSession({ sessionId: "session-1", activity: "idle", agentName: "cycling-agent" })],
      ]);
      const activityChangedAt = new Map([
        ["session-1", "2025-01-01T00:01:00Z"],
      ]);

      useSessionStore.setState({ sessions, activityChangedAt });

      const { rerender } = render(<NotificationPanel onClose={() => {}} />);

      // Dismiss the notification
      const dismissButton = screen.getByRole("button", { name: /dismiss notification/i });
      fireEvent.click(dismissButton);

      expect(screen.getByText("Notifications (0)")).toBeInTheDocument();

      // Simulate session cycling: activityChangedAt updates to a newer timestamp
      useSessionStore.setState({
        sessions,
        activityChangedAt: new Map([["session-1", "2025-01-01T00:10:00Z"]]),
      });

      rerender(<NotificationPanel onClose={() => {}} />);

      expect(screen.getByText("Notifications (1)")).toBeInTheDocument();
      expect(screen.getByText("cycling-agent")).toBeInTheDocument();
    });

    it("Clear all does not affect future notifications from new sessions", () => {
      const sessions = new Map([
        ["session-1", buildSession({ sessionId: "session-1", activity: "idle", agentName: "agent-1" })],
      ]);
      const activityChangedAt = new Map([
        ["session-1", "2025-01-01T00:01:00Z"],
      ]);

      useSessionStore.setState({ sessions, activityChangedAt });

      const { rerender } = render(<NotificationPanel onClose={() => {}} />);

      // Clear all
      fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
      expect(screen.getByText("Notifications (0)")).toBeInTheDocument();

      // New session arrives
      const updatedSessions = new Map([
        ["session-1", buildSession({ sessionId: "session-1", activity: "idle", agentName: "agent-1" })],
        ["session-new", buildSession({ sessionId: "session-new", activity: "idle", agentName: "new-agent" })],
      ]);
      useSessionStore.setState({
        sessions: updatedSessions,
        activityChangedAt: new Map([
          ["session-1", "2025-01-01T00:01:00Z"],
          ["session-new", "2025-01-01T00:05:00Z"],
        ]),
      });

      rerender(<NotificationPanel onClose={() => {}} />);

      // New session appears; dismissed session stays hidden
      expect(screen.getByText("Notifications (1)")).toBeInTheDocument();
      expect(screen.getByText("new-agent")).toBeInTheDocument();
      expect(screen.queryByText("agent-1")).not.toBeInTheDocument();
    });
  });
});
