import { describe, it, expect, vi } from "vitest";
import {
  createActivityTracker,
  type ActivityEvent,
  type ActivityTracker,
} from "./activity-tracker.js";

describe("ActivityTracker", () => {
  function buildTracker(onStateChange?: (state: string) => void) {
    let tick = 0;
    return createActivityTracker({
      onStateChange,
      now: () => `2026-01-01T00:00:0${tick++}.000Z`,
    });
  }

  describe("initial state", () => {
    it("starts in idle", () => {
      const tracker = buildTracker();
      expect(tracker.current).toBe("idle");
    });

    it("snapshot returns idle with timestamp", () => {
      const tracker = buildTracker();
      const snap = tracker.snapshot();
      expect(snap.activity).toBe("idle");
      expect(snap.lastEventTime).toBe("2026-01-01T00:00:00.000Z");
    });
  });

  describe("valid transitions", () => {
    it("idle + turn_start → processing", () => {
      const tracker = buildTracker();
      tracker.onTurnStart();
      expect(tracker.current).toBe("processing");
    });

    it("processing + tool_execution_start → running_tool", () => {
      const tracker = buildTracker();
      tracker.onTurnStart();
      tracker.onToolExecutionStart();
      expect(tracker.current).toBe("running_tool");
    });

    it("processing + turn_end → idle", () => {
      const tracker = buildTracker();
      tracker.onTurnStart();
      tracker.onTurnEnd();
      expect(tracker.current).toBe("idle");
    });

    it("running_tool + tool_execution_end → processing", () => {
      const tracker = buildTracker();
      tracker.onTurnStart();
      tracker.onToolExecutionStart();
      tracker.onToolExecutionEnd();
      expect(tracker.current).toBe("processing");
    });

    it("running_tool + tool_permission_requested → pending_approval", () => {
      const tracker = buildTracker();
      tracker.onTurnStart();
      tracker.onToolExecutionStart();
      tracker.onToolPermissionRequested();
      expect(tracker.current).toBe("pending_approval");
    });

    it("pending_approval + tool_permission_granted → running_tool", () => {
      const tracker = buildTracker();
      tracker.onTurnStart();
      tracker.onToolExecutionStart();
      tracker.onToolPermissionRequested();
      tracker.onToolPermissionGranted();
      expect(tracker.current).toBe("running_tool");
    });

    it("pending_approval + tool_permission_denied → processing", () => {
      const tracker = buildTracker();
      tracker.onTurnStart();
      tracker.onToolExecutionStart();
      tracker.onToolPermissionRequested();
      tracker.onToolPermissionDenied();
      expect(tracker.current).toBe("processing");
    });

    it("full cycle: idle → processing → running_tool → processing → idle", () => {
      const tracker = buildTracker();
      tracker.onTurnStart();
      tracker.onToolExecutionStart();
      tracker.onToolExecutionEnd();
      tracker.onTurnEnd();
      expect(tracker.current).toBe("idle");
    });
  });

  describe("invalid transitions (ignored)", () => {
    it("idle + tool_execution_start → stays idle", () => {
      const tracker = buildTracker();
      tracker.onToolExecutionStart();
      expect(tracker.current).toBe("idle");
    });

    it("idle + tool_execution_end → stays idle", () => {
      const tracker = buildTracker();
      tracker.onToolExecutionEnd();
      expect(tracker.current).toBe("idle");
    });

    it("idle + turn_end → stays idle", () => {
      const tracker = buildTracker();
      tracker.onTurnEnd();
      expect(tracker.current).toBe("idle");
    });

    it("idle + tool_permission_granted → stays idle", () => {
      const tracker = buildTracker();
      tracker.onToolPermissionGranted();
      expect(tracker.current).toBe("idle");
    });

    it("idle + tool_permission_denied → stays idle", () => {
      const tracker = buildTracker();
      tracker.onToolPermissionDenied();
      expect(tracker.current).toBe("idle");
    });

    it("processing + tool_execution_end → stays processing", () => {
      const tracker = buildTracker();
      tracker.onTurnStart();
      tracker.onToolExecutionEnd();
      expect(tracker.current).toBe("processing");
    });

    it("processing + tool_permission_requested → stays processing", () => {
      const tracker = buildTracker();
      tracker.onTurnStart();
      tracker.onToolPermissionRequested();
      expect(tracker.current).toBe("processing");
    });

    it("processing + turn_start → stays processing", () => {
      const tracker = buildTracker();
      tracker.onTurnStart();
      tracker.handleEvent("turn_start");
      expect(tracker.current).toBe("processing");
    });

    it("running_tool + turn_start → stays running_tool", () => {
      const tracker = buildTracker();
      tracker.onTurnStart();
      tracker.onToolExecutionStart();
      tracker.handleEvent("turn_start");
      expect(tracker.current).toBe("running_tool");
    });

    it("running_tool + turn_end → stays running_tool", () => {
      const tracker = buildTracker();
      tracker.onTurnStart();
      tracker.onToolExecutionStart();
      tracker.onTurnEnd();
      expect(tracker.current).toBe("running_tool");
    });

    it("pending_approval + turn_start → stays pending_approval", () => {
      const tracker = buildTracker();
      tracker.onTurnStart();
      tracker.onToolExecutionStart();
      tracker.onToolPermissionRequested();
      tracker.handleEvent("turn_start");
      expect(tracker.current).toBe("pending_approval");
    });

    it("pending_approval + tool_execution_start → stays pending_approval", () => {
      const tracker = buildTracker();
      tracker.onTurnStart();
      tracker.onToolExecutionStart();
      tracker.onToolPermissionRequested();
      tracker.onToolExecutionStart();
      expect(tracker.current).toBe("pending_approval");
    });

    it("pending_approval + tool_execution_end → stays pending_approval", () => {
      const tracker = buildTracker();
      tracker.onTurnStart();
      tracker.onToolExecutionStart();
      tracker.onToolPermissionRequested();
      tracker.onToolExecutionEnd();
      expect(tracker.current).toBe("pending_approval");
    });
  });

  describe("state change callback", () => {
    it("fires onStateChange for valid transitions", () => {
      const callback = vi.fn();
      const tracker = buildTracker(callback);
      tracker.onTurnStart();
      expect(callback).toHaveBeenCalledWith("processing");
    });

    it("does not fire onStateChange for invalid transitions", () => {
      const callback = vi.fn();
      const tracker = buildTracker(callback);
      tracker.onToolExecutionEnd(); // invalid from idle
      expect(callback).not.toHaveBeenCalled();
    });

    it("fires for each valid transition in sequence", () => {
      const states: string[] = [];
      const tracker = buildTracker((state) => states.push(state));

      tracker.onTurnStart();
      tracker.onToolExecutionStart();
      tracker.onToolExecutionEnd();
      tracker.onTurnEnd();

      expect(states).toEqual([
        "processing",
        "running_tool",
        "processing",
        "idle",
      ]);
    });
  });

  describe("lastEventTime", () => {
    it("updates on valid transitions", () => {
      const tracker = buildTracker();
      const t0 = tracker.snapshot().lastEventTime;
      tracker.onTurnStart();
      const t1 = tracker.snapshot().lastEventTime;
      expect(t1).not.toBe(t0);
    });

    it("does not update on invalid transitions", () => {
      const tracker = buildTracker();
      const t0 = tracker.snapshot().lastEventTime;
      tracker.onToolExecutionEnd(); // invalid from idle
      expect(tracker.snapshot().lastEventTime).toBe(t0);
    });
  });

  describe("handleEvent generic method", () => {
    it("accepts all event types as strings", () => {
      const tracker = buildTracker();
      tracker.handleEvent("turn_start");
      expect(tracker.current).toBe("processing");
      tracker.handleEvent("tool_execution_start");
      expect(tracker.current).toBe("running_tool");
      tracker.handleEvent("tool_permission_requested");
      expect(tracker.current).toBe("pending_approval");
      tracker.handleEvent("tool_permission_granted");
      expect(tracker.current).toBe("running_tool");
      tracker.handleEvent("tool_execution_end");
      expect(tracker.current).toBe("processing");
      tracker.handleEvent("tool_execution_start");
      expect(tracker.current).toBe("running_tool");
      tracker.handleEvent("tool_execution_end");
      expect(tracker.current).toBe("processing");
      tracker.handleEvent("turn_end");
      expect(tracker.current).toBe("idle");
    });
  });
});
