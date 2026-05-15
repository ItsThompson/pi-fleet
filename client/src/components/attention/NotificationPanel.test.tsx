import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotificationPanel } from "./NotificationPanel";
import { useSessionStore } from "@/stores/session-store";
import { usePodStore } from "@/stores/pod-store";
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
    const mockOpenSession = vi.fn();
    (window as unknown as Record<string, unknown>).piFleet = { openSession: mockOpenSession };

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
    delete (window as unknown as Record<string, unknown>).piFleet;
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(<NotificationPanel onClose={onClose} />);

    const closeButton = screen.getByRole("button", { name: /close notifications/i });
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledOnce();
  });
});
