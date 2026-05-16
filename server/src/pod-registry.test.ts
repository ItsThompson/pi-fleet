import { describe, it, expect, beforeEach } from "vitest";
import { PodRegistry, type PodEvent } from "./pod-registry.js";
import { SessionRegistry } from "./session-registry.js";
import type { RegisterBody } from "@pi-fleet/shared";

function buildRegisterBody(overrides: Partial<RegisterBody> = {}): RegisterBody {
  return {
    sessionId: `session-${Math.random().toString(36).slice(2, 8)}`,
    pid: Math.floor(Math.random() * 10000),
    cwd: "/Users/test/project",
    tmuxTarget: "main:1.0",
    startTime: new Date().toISOString(),
    ...overrides,
  };
}

describe("PodRegistry", () => {
  let sessionRegistry: SessionRegistry;
  let podRegistry: PodRegistry;
  let events: PodEvent[];

  beforeEach(() => {
    sessionRegistry = new SessionRegistry({ now: Date.now });
    podRegistry = new PodRegistry({ sessionRegistry });
    events = [];
    podRegistry.onEvent((event) => events.push(event));
  });

  describe("single-member pods", () => {
    it("sessions without ownership reports exist as single-member pods", () => {
      sessionRegistry.register(buildRegisterBody({ sessionId: "s1", cwd: "/home/project-a" }));
      sessionRegistry.register(buildRegisterBody({ sessionId: "s2", cwd: "/home/project-b" }));

      const pods = podRegistry.getPods();
      expect(pods).toHaveLength(2);
      expect(pods[0].memberSessionIds).toEqual(["s1"]);
      expect(pods[0].leadSessionId).toBe("s1");
      expect(pods[1].memberSessionIds).toEqual(["s2"]);
    });

    it("single-member pod uses agentName as displayName", () => {
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "s1", agentName: "MyAgent" }),
      );

      const pods = podRegistry.getPods();
      expect(pods[0].displayName).toBe("MyAgent");
    });

    it("single-member pod falls back to cwd basename for displayName", () => {
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "s1", cwd: "/Users/test/my-project" }),
      );

      const pods = podRegistry.getPods();
      expect(pods[0].displayName).toBe("my-project");
    });
  });

  describe("reportOwnership", () => {
    it("groups matching sessions under parent's pod", () => {
      sessionRegistry.register(buildRegisterBody({ sessionId: "parent" }));
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-1", subagentId: "agent-a" }),
      );
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-2", subagentId: "agent-b" }),
      );

      const result = podRegistry.reportOwnership("parent", ["agent-a", "agent-b"]);

      expect(result.matchedIds).toEqual(["agent-a", "agent-b"]);
      expect(result.unmatchedIds).toEqual([]);

      const pods = podRegistry.getPods();
      const parentPod = pods.find((p) => p.leadSessionId === "parent");
      expect(parentPod).toBeDefined();
      expect(parentPod!.memberSessionIds).toContain("parent");
      expect(parentPod!.memberSessionIds).toContain("child-1");
      expect(parentPod!.memberSessionIds).toContain("child-2");
    });

    it("returns unmatched IDs for unregistered subagents", () => {
      sessionRegistry.register(buildRegisterBody({ sessionId: "parent" }));
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-1", subagentId: "agent-a" }),
      );

      const result = podRegistry.reportOwnership("parent", [
        "agent-a",
        "agent-x",
        "agent-y",
      ]);

      expect(result.matchedIds).toEqual(["agent-a"]);
      expect(result.unmatchedIds).toEqual(["agent-x", "agent-y"]);
    });

    it("emits pod:formed on first ownership report with matches", () => {
      sessionRegistry.register(buildRegisterBody({ sessionId: "parent" }));
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-1", subagentId: "agent-a" }),
      );

      podRegistry.reportOwnership("parent", ["agent-a"]);

      const formedEvents = events.filter((e) => e.type === "pod:formed");
      expect(formedEvents).toHaveLength(1);
      expect(formedEvents[0].type === "pod:formed" && formedEvents[0].pod.leadSessionId).toBe("parent");
    });

    it("emits pod:updated on subsequent ownership reports", () => {
      sessionRegistry.register(buildRegisterBody({ sessionId: "parent" }));
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-1", subagentId: "agent-a" }),
      );

      podRegistry.reportOwnership("parent", ["agent-a"]);
      events.length = 0;

      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-2", subagentId: "agent-b" }),
      );
      podRegistry.reportOwnership("parent", ["agent-a", "agent-b"]);

      const updatedEvents = events.filter((e) => e.type === "pod:updated");
      expect(updatedEvents).toHaveLength(1);
    });

    it("does not emit pod:formed if parent session does not exist", () => {
      const result = podRegistry.reportOwnership("nonexistent", ["agent-a"]);

      expect(result.matchedIds).toEqual([]);
      expect(result.unmatchedIds).toEqual(["agent-a"]);
      expect(events).toHaveLength(0);
    });
  });

  describe("handleSessionRegistered (re-evaluation)", () => {
    it("picks up unmatched subagents when they later register", () => {
      sessionRegistry.register(buildRegisterBody({ sessionId: "parent" }));

      // Report ownership before child registers
      podRegistry.reportOwnership("parent", ["agent-a"]);
      events.length = 0;

      // Now child registers
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-1", subagentId: "agent-a" }),
      );
      podRegistry.handleSessionRegistered("child-1");

      const updatedEvents = events.filter((e) => e.type === "pod:updated");
      expect(updatedEvents).toHaveLength(1);

      const pods = podRegistry.getPods();
      const parentPod = pods.find((p) => p.leadSessionId === "parent");
      expect(parentPod!.memberSessionIds).toContain("child-1");
    });

    it("does not emit events if session has no subagentId", () => {
      sessionRegistry.register(buildRegisterBody({ sessionId: "parent" }));
      podRegistry.reportOwnership("parent", ["agent-a"]);
      events.length = 0;

      sessionRegistry.register(buildRegisterBody({ sessionId: "unrelated" }));
      podRegistry.handleSessionRegistered("unrelated");

      expect(events).toHaveLength(0);
    });
  });

  describe("handleSessionRemoved: parent death", () => {
    it("parent removed: children become independent single-member pods", () => {
      sessionRegistry.register(buildRegisterBody({ sessionId: "parent" }));
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-1", subagentId: "agent-a" }),
      );
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-2", subagentId: "agent-b" }),
      );
      podRegistry.reportOwnership("parent", ["agent-a", "agent-b"]);
      events.length = 0;

      // Remove parent
      sessionRegistry.unregister("parent");
      podRegistry.handleSessionRemoved("parent");

      const dissolvedEvents = events.filter((e) => e.type === "pod:dissolved");
      expect(dissolvedEvents).toHaveLength(1);
      expect(
        dissolvedEvents[0].type === "pod:dissolved" &&
          dissolvedEvents[0].leadSessionId,
      ).toBe("parent");

      const formedEvents = events.filter((e) => e.type === "pod:formed");
      expect(formedEvents).toHaveLength(2);

      // Children are now independent single-member pods
      const pods = podRegistry.getPods();
      expect(pods).toHaveLength(2);
      expect(pods.every((p) => p.memberSessionIds.length === 1)).toBe(true);
    });
  });

  describe("handleSessionRemoved: child death", () => {
    it("child removed: pod continues if parent lives, pod:updated emitted", () => {
      sessionRegistry.register(buildRegisterBody({ sessionId: "parent" }));
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-1", subagentId: "agent-a" }),
      );
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-2", subagentId: "agent-b" }),
      );
      podRegistry.reportOwnership("parent", ["agent-a", "agent-b"]);
      events.length = 0;

      // Remove child
      sessionRegistry.unregister("child-1");
      podRegistry.handleSessionRemoved("child-1");

      const updatedEvents = events.filter((e) => e.type === "pod:updated");
      expect(updatedEvents).toHaveLength(1);

      const pods = podRegistry.getPods();
      const parentPod = pods.find((p) => p.leadSessionId === "parent");
      expect(parentPod!.memberSessionIds).toContain("parent");
      expect(parentPod!.memberSessionIds).toContain("child-2");
      expect(parentPod!.memberSessionIds).not.toContain("child-1");
    });
  });

  describe("state aggregation", () => {
    it("pod state = worst state among members (pending_approval > idle > running_tool > processing)", () => {
      sessionRegistry.register(buildRegisterBody({ sessionId: "parent" }));
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-1", subagentId: "agent-a" }),
      );
      podRegistry.reportOwnership("parent", ["agent-a"]);

      // Parent is idle, child is processing (default)
      sessionRegistry.heartbeat({
        sessionId: "parent",
        activity: "idle",
        lastEventTime: new Date().toISOString(),
      });

      const pods = podRegistry.getPods();
      const pod = pods.find((p) => p.leadSessionId === "parent")!;
      // idle (3) > processing (1), so pod state = idle
      expect(pod.state).toBe("idle");
    });

    it("pending_approval overrides all other states", () => {
      sessionRegistry.register(buildRegisterBody({ sessionId: "parent" }));
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-1", subagentId: "agent-a" }),
      );
      podRegistry.reportOwnership("parent", ["agent-a"]);

      sessionRegistry.heartbeat({
        sessionId: "parent",
        activity: "running_tool",
        lastEventTime: new Date().toISOString(),
      });
      sessionRegistry.heartbeat({
        sessionId: "child-1",
        activity: "pending_approval",
        lastEventTime: new Date().toISOString(),
      });

      const pods = podRegistry.getPods();
      const pod = pods.find((p) => p.leadSessionId === "parent")!;
      expect(pod.state).toBe("pending_approval");
    });
  });

  describe("attentionCount", () => {
    it("counts members with pending_approval or idle", () => {
      sessionRegistry.register(buildRegisterBody({ sessionId: "parent" }));
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-1", subagentId: "agent-a" }),
      );
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-2", subagentId: "agent-b" }),
      );
      podRegistry.reportOwnership("parent", ["agent-a", "agent-b"]);

      // Parent: idle, child-1: pending_approval, child-2: processing
      sessionRegistry.heartbeat({
        sessionId: "parent",
        activity: "idle",
        lastEventTime: new Date().toISOString(),
      });
      sessionRegistry.heartbeat({
        sessionId: "child-1",
        activity: "pending_approval",
        lastEventTime: new Date().toISOString(),
      });
      sessionRegistry.heartbeat({
        sessionId: "child-2",
        activity: "processing",
        lastEventTime: new Date().toISOString(),
      });

      const pods = podRegistry.getPods();
      const pod = pods.find((p) => p.leadSessionId === "parent")!;
      // idle + pending_approval = 2 attention states
      expect(pod.attentionCount).toBe(2);
    });

    it("running_tool and processing do not count as attention", () => {
      sessionRegistry.register(buildRegisterBody({ sessionId: "parent" }));
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-1", subagentId: "agent-a" }),
      );
      podRegistry.reportOwnership("parent", ["agent-a"]);

      sessionRegistry.heartbeat({
        sessionId: "parent",
        activity: "running_tool",
        lastEventTime: new Date().toISOString(),
      });
      sessionRegistry.heartbeat({
        sessionId: "child-1",
        activity: "processing",
        lastEventTime: new Date().toISOString(),
      });

      const pods = podRegistry.getPods();
      const pod = pods.find((p) => p.leadSessionId === "parent")!;
      expect(pod.attentionCount).toBe(0);
    });
  });

  describe("graceful degradation", () => {
    it("all sessions are single-member pods when no ownership is reported", () => {
      sessionRegistry.register(buildRegisterBody({ sessionId: "s1" }));
      sessionRegistry.register(buildRegisterBody({ sessionId: "s2" }));
      sessionRegistry.register(buildRegisterBody({ sessionId: "s3" }));

      const pods = podRegistry.getPods();
      expect(pods).toHaveLength(3);
      pods.forEach((pod) => {
        expect(pod.memberSessionIds).toHaveLength(1);
        expect(pod.leadSessionId).toBe(pod.memberSessionIds[0]);
      });
    });
  });

  describe("getPodForSession", () => {
    it("returns the pod containing the given session", () => {
      sessionRegistry.register(buildRegisterBody({ sessionId: "parent" }));
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-1", subagentId: "agent-a" }),
      );
      podRegistry.reportOwnership("parent", ["agent-a"]);

      const pod = podRegistry.getPodForSession("child-1");
      expect(pod).toBeDefined();
      expect(pod!.leadSessionId).toBe("parent");
      expect(pod!.memberSessionIds).toContain("child-1");
    });

    it("returns undefined for non-existent session", () => {
      expect(podRegistry.getPodForSession("nonexistent")).toBeUndefined();
    });
  });

  describe("event listener cleanup", () => {
    it("unsubscribe removes listener", () => {
      sessionRegistry.register(buildRegisterBody({ sessionId: "parent" }));
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child-1", subagentId: "agent-a" }),
      );

      const extraEvents: PodEvent[] = [];
      const unsub = podRegistry.onEvent((e) => extraEvents.push(e));
      unsub();

      podRegistry.reportOwnership("parent", ["agent-a"]);
      expect(extraEvents).toHaveLength(0);
    });
  });

  describe("CWD-based pod inference", () => {
    it("infers parent when exactly one non-subagent session shares cwd", () => {
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "parent", cwd: "/project-a" }),
      );
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child", cwd: "/project-a", subagentId: "sub-1" }),
      );
      events = [];
      podRegistry.handleSessionRegistered("child");

      const pods = podRegistry.getPods();
      expect(pods).toHaveLength(1);
      expect(pods[0].leadSessionId).toBe("parent");
      expect(pods[0].memberSessionIds).toContain("child");
    });

    it("does not infer when multiple non-subagent sessions share cwd", () => {
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "s1", cwd: "/project-a" }),
      );
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "s2", cwd: "/project-a" }),
      );
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child", cwd: "/project-a", subagentId: "sub-1" }),
      );
      podRegistry.handleSessionRegistered("child");

      const pods = podRegistry.getPods();
      expect(pods).toHaveLength(3);
      pods.forEach((pod) => {
        expect(pod.memberSessionIds).toHaveLength(1);
      });
    });

    it("does not infer across different cwds", () => {
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "parent", cwd: "/project-a" }),
      );
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child", cwd: "/project-b", subagentId: "sub-1" }),
      );
      podRegistry.handleSessionRegistered("child");

      const pods = podRegistry.getPods();
      expect(pods).toHaveLength(2);
      pods.forEach((pod) => {
        expect(pod.memberSessionIds).toHaveLength(1);
      });
    });

    it("emits pod:formed on inferred grouping", () => {
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "parent", cwd: "/project-a" }),
      );
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child", cwd: "/project-a", subagentId: "sub-1" }),
      );
      events = [];
      podRegistry.handleSessionRegistered("child");

      const formed = events.filter((e) => e.type === "pod:formed");
      expect(formed).toHaveLength(1);
      expect((formed[0] as { pod: { leadSessionId: string } }).pod.leadSessionId).toBe("parent");
    });

    it("explicit ownership takes precedence over inference", () => {
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "parent", cwd: "/project-a" }),
      );
      sessionRegistry.register(
        buildRegisterBody({ sessionId: "child", cwd: "/project-a", subagentId: "sub-1" }),
      );

      // Explicit ownership report overrides
      podRegistry.reportOwnership("parent", ["sub-1"]);

      const pods = podRegistry.getPods();
      expect(pods).toHaveLength(1);
      expect(pods[0].leadSessionId).toBe("parent");
      expect(pods[0].memberSessionIds).toContain("child");
    });
  });
});
