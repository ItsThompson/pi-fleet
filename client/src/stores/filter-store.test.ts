import { describe, it, expect, beforeEach } from "vitest";
import { useFilterStore } from "./filter-store";
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

describe("filter-store", () => {
  beforeEach(() => {
    useFilterStore.setState({ activeFilters: new Set() });
  });

  describe("toggleFilter", () => {
    it("adds a filter when not active", () => {
      useFilterStore.getState().toggleFilter("idle");
      expect(useFilterStore.getState().activeFilters.has("idle")).toBe(true);
    });

    it("removes a filter when already active", () => {
      useFilterStore.setState({ activeFilters: new Set(["idle"]) });
      useFilterStore.getState().toggleFilter("idle");
      expect(useFilterStore.getState().activeFilters.has("idle")).toBe(false);
    });

    it("supports multiple active filters simultaneously", () => {
      useFilterStore.getState().toggleFilter("idle");
      useFilterStore.getState().toggleFilter("pending_approval");

      const { activeFilters } = useFilterStore.getState();
      expect(activeFilters.has("idle")).toBe(true);
      expect(activeFilters.has("pending_approval")).toBe(true);
      expect(activeFilters.size).toBe(2);
    });

    it("toggles processing independently from running_tool", () => {
      useFilterStore.getState().toggleFilter("processing");

      const { activeFilters } = useFilterStore.getState();
      expect(activeFilters.has("processing")).toBe(true);
      expect(activeFilters.has("running_tool")).toBe(false);
      expect(activeFilters.size).toBe(1);
    });

    it("removes processing independently when toggling off", () => {
      useFilterStore.setState({
        activeFilters: new Set(["processing", "running_tool"]),
      });
      useFilterStore.getState().toggleFilter("processing");

      const { activeFilters } = useFilterStore.getState();
      expect(activeFilters.has("processing")).toBe(false);
      expect(activeFilters.has("running_tool")).toBe(true);
      expect(activeFilters.size).toBe(1);
    });

    it("toggles running_tool independently from processing", () => {
      useFilterStore.getState().toggleFilter("running_tool");

      const { activeFilters } = useFilterStore.getState();
      expect(activeFilters.has("running_tool")).toBe(true);
      expect(activeFilters.has("processing")).toBe(false);
    });
  });

  describe("clearFilters", () => {
    it("removes all active filters", () => {
      useFilterStore.setState({
        activeFilters: new Set(["idle", "pending_approval"]),
      });
      useFilterStore.getState().clearFilters();
      expect(useFilterStore.getState().activeFilters.size).toBe(0);
    });
  });

  describe("passesFilter", () => {
    it("passes all sessions when no filters active", () => {
      const session = buildSession({ activity: "processing" });
      expect(useFilterStore.getState().passesFilter(session)).toBe(true);
    });

    it("passes session matching active filter", () => {
      useFilterStore.setState({ activeFilters: new Set(["idle"]) });
      const session = buildSession({ activity: "idle" });
      expect(useFilterStore.getState().passesFilter(session)).toBe(true);
    });

    it("rejects session not matching active filter", () => {
      useFilterStore.setState({ activeFilters: new Set(["idle"]) });
      const session = buildSession({ activity: "processing" });
      expect(useFilterStore.getState().passesFilter(session)).toBe(false);
    });

    it("uses OR logic with multiple filters", () => {
      useFilterStore.setState({
        activeFilters: new Set(["idle", "pending_approval"]),
      });

      const idleSession = buildSession({ activity: "idle" });
      const approvalSession = buildSession({ activity: "pending_approval" });
      const processingSession = buildSession({ activity: "processing" });

      expect(useFilterStore.getState().passesFilter(idleSession)).toBe(true);
      expect(useFilterStore.getState().passesFilter(approvalSession)).toBe(true);
      expect(useFilterStore.getState().passesFilter(processingSession)).toBe(false);
    });
  });

  describe("podPassesFilter", () => {
    it("passes all pods when no filters active", () => {
      const pod = buildPod();
      const sessions = new Map([["session-1", buildSession()]]);
      expect(useFilterStore.getState().podPassesFilter(pod, sessions)).toBe(true);
    });

    it("passes pod when any member matches filter", () => {
      useFilterStore.setState({ activeFilters: new Set(["idle"]) });

      const pod = buildPod({
        memberSessionIds: ["session-1", "session-2"],
      });
      const sessions = new Map([
        ["session-1", buildSession({ sessionId: "session-1", activity: "processing" })],
        ["session-2", buildSession({ sessionId: "session-2", activity: "idle" })],
      ]);

      expect(useFilterStore.getState().podPassesFilter(pod, sessions)).toBe(true);
    });

    it("rejects pod when no member matches filter", () => {
      useFilterStore.setState({ activeFilters: new Set(["pending_approval"]) });

      const pod = buildPod({
        memberSessionIds: ["session-1", "session-2"],
      });
      const sessions = new Map([
        ["session-1", buildSession({ sessionId: "session-1", activity: "processing" })],
        ["session-2", buildSession({ sessionId: "session-2", activity: "idle" })],
      ]);

      expect(useFilterStore.getState().podPassesFilter(pod, sessions)).toBe(false);
    });

    it("handles missing sessions gracefully", () => {
      useFilterStore.setState({ activeFilters: new Set(["idle"]) });

      const pod = buildPod({
        memberSessionIds: ["session-1", "missing-session"],
      });
      const sessions = new Map([
        ["session-1", buildSession({ sessionId: "session-1", activity: "idle" })],
      ]);

      expect(useFilterStore.getState().podPassesFilter(pod, sessions)).toBe(true);
    });

    it("uses OR logic: pod passes if any member matches any active filter", () => {
      useFilterStore.setState({
        activeFilters: new Set(["idle", "pending_approval"]),
      });

      const pod = buildPod({
        memberSessionIds: ["session-1"],
      });
      const sessions = new Map([
        ["session-1", buildSession({ sessionId: "session-1", activity: "pending_approval" })],
      ]);

      expect(useFilterStore.getState().podPassesFilter(pod, sessions)).toBe(true);
    });
  });
});
