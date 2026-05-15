import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PodView } from "./PodView";
import { useSessionStore } from "@/stores/session-store";
import { useFilterStore } from "@/stores/filter-store";
import type { Pod, RegisteredSession } from "@pi-fleet/shared";

function buildSession(overrides?: Partial<RegisteredSession>): RegisteredSession {
  return {
    sessionId: "s-1",
    pid: 123,
    cwd: "/home/user/project",
    tmuxTarget: "main:1.0",
    startTime: "2025-01-01T00:00:00Z",
    activity: "processing",
    lastSeen: "2025-01-01T00:01:00Z",
    lastEventTime: "2025-01-01T00:01:00Z",
    agentName: "worker",
    model: "Claude Sonnet 4",
    contextUsage: { tokens: 10000, contextWindow: 200000, percent: 5 },
    turnCount: 3,
    ...overrides,
  };
}

describe("PodView - state grouping", () => {
  beforeEach(() => {
    useSessionStore.setState({ sessions: new Map(), activityChangedAt: new Map() });
    useFilterStore.setState({ activeFilters: new Set() });
  });

  it("groups sessions into Needs Attention and Working sections", () => {
    const sessions = new Map<string, RegisteredSession>([
      ["s-idle", buildSession({ sessionId: "s-idle", agentName: "idle-agent", activity: "idle" })],
      ["s-approval", buildSession({ sessionId: "s-approval", agentName: "blocked-agent", activity: "pending_approval" })],
      ["s-working", buildSession({ sessionId: "s-working", agentName: "busy-agent", activity: "processing" })],
      ["s-tool", buildSession({ sessionId: "s-tool", agentName: "tool-agent", activity: "running_tool" })],
    ]);
    useSessionStore.setState({ sessions, activityChangedAt: new Map() });

    const pod: Pod = {
      leadSessionId: "s-idle",
      memberSessionIds: ["s-idle", "s-approval", "s-working", "s-tool"],
      displayName: "test-pod",
      state: "pending_approval",
      attentionCount: 2,
    };

    render(<PodView pod={pod} />);

    // Verify grouping headers with counts
    expect(screen.getByText("Needs Attention (2)")).toBeInTheDocument();
    expect(screen.getByText("Working (2)")).toBeInTheDocument();

    // Verify sessions are rendered
    expect(screen.getByText("idle-agent")).toBeInTheDocument();
    expect(screen.getByText("blocked-agent")).toBeInTheDocument();
    expect(screen.getByText("busy-agent")).toBeInTheDocument();
    expect(screen.getByText("tool-agent")).toBeInTheDocument();
  });

  it("shows lead and sub badges in multi-member pods", () => {
    const sessions = new Map<string, RegisteredSession>([
      ["lead-1", buildSession({ sessionId: "lead-1", agentName: "orchestrator", activity: "processing" })],
      ["sub-1", buildSession({ sessionId: "sub-1", agentName: "sub-worker", activity: "running_tool" })],
    ]);
    useSessionStore.setState({ sessions, activityChangedAt: new Map() });

    const pod: Pod = {
      leadSessionId: "lead-1",
      memberSessionIds: ["lead-1", "sub-1"],
      displayName: "multi-pod",
      state: "running_tool",
      attentionCount: 0,
    };

    render(<PodView pod={pod} />);

    expect(screen.getByText("lead")).toBeInTheDocument();
    expect(screen.getByText("sub")).toBeInTheDocument();
  });

  it("hides Needs Attention section when no sessions need attention", () => {
    const sessions = new Map<string, RegisteredSession>([
      ["s-1", buildSession({ sessionId: "s-1", activity: "processing" })],
    ]);
    useSessionStore.setState({ sessions, activityChangedAt: new Map() });

    const pod: Pod = {
      leadSessionId: "s-1",
      memberSessionIds: ["s-1"],
      displayName: "working-pod",
      state: "processing",
      attentionCount: 0,
    };

    render(<PodView pod={pod} />);

    expect(screen.queryByRole("heading", { name: /Needs Attention/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Working (1)" })).toBeInTheDocument();
  });
});
