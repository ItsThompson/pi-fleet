import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionCard } from "./SessionCard";
import type { RegisteredSession } from "@pi-fleet/shared";

function buildSession(overrides?: Partial<RegisteredSession>): RegisteredSession {
  return {
    sessionId: "sess-abc123",
    pid: 9876,
    cwd: "/home/user/my-project",
    tmuxTarget: "main:1.0",
    startTime: "2025-01-01T00:00:00Z",
    activity: "processing",
    lastSeen: "2025-01-01T00:01:00Z",
    lastEventTime: "2025-01-01T00:01:00Z",
    agentName: "code-writer",
    model: "Claude Sonnet 4",
    contextUsage: { tokens: 50000, contextWindow: 200000, percent: 25 },
    turnCount: 12,
    thinkingLevel: "high",
    ...overrides,
  };
}

describe("SessionCard", () => {
  beforeEach(() => {
    // Mock the piFleet bridge
    window.piFleet = {
      openSession: vi.fn().mockResolvedValue({ ok: true }),
      getConfig: vi.fn(),
      setConfig: vi.fn(),
      onVisibilityChange: vi.fn(),
      getServerUrl: vi.fn(() => ""),
      getVersion: vi.fn(() => "1.0.0"),
    };
  });

  it("renders session name from agentName", () => {
    render(<SessionCard session={buildSession()} />);
    expect(screen.getByText("code-writer")).toBeInTheDocument();
  });

  it("falls back to directory name when agentName is absent", () => {
    render(<SessionCard session={buildSession({ agentName: undefined })} />);
    expect(screen.getByText("my-project")).toBeInTheDocument();
  });

  it("renders model name", () => {
    render(<SessionCard session={buildSession()} />);
    expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument();
  });

  it("renders context usage percentage", () => {
    render(<SessionCard session={buildSession()} />);
    expect(screen.getByText("25%")).toBeInTheDocument();
  });

  it("renders turn count", () => {
    render(<SessionCard session={buildSession()} />);
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders thinking level when non-off", () => {
    render(<SessionCard session={buildSession({ thinkingLevel: "high" })} />);
    expect(screen.getByText("high")).toBeInTheDocument();
  });

  it("does not render thinking level when off", () => {
    render(<SessionCard session={buildSession({ thinkingLevel: "off" })} />);
    expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
  });

  it("renders status dot with correct label", () => {
    render(<SessionCard session={buildSession({ activity: "pending_approval" })} />);
    expect(screen.getByLabelText("Needs approval")).toBeInTheDocument();
  });

  it("shows sub badge when isSubagent", () => {
    render(<SessionCard session={buildSession()} isSubagent />);
    expect(screen.getByText("sub")).toBeInTheDocument();
  });

  it("shows lead badge when isLead", () => {
    render(<SessionCard session={buildSession()} isLead />);
    expect(screen.getByText("lead")).toBeInTheDocument();
  });

  it("calls piFleet.openSession on button click", async () => {
    const user = userEvent.setup();
    render(<SessionCard session={buildSession()} />);

    const openButton = screen.getByTitle("Open in terminal");
    await user.click(openButton);

    const bridge = window.piFleet!;
    expect(bridge.openSession).toHaveBeenCalledWith("sess-abc123");
  });
});
