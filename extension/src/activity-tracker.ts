import type { ActivityStatus } from "@pi-fleet/shared";

export interface ActivitySnapshot {
  activity: ActivityStatus;
  lastEventTime: string;
}

/**
 * Valid transitions for the pi-fleet activity state machine.
 * Key = current state, Value = map of trigger → next state.
 */
const TRANSITIONS: Record<
  ActivityStatus,
  Partial<Record<string, ActivityStatus>>
> = {
  idle: {
    turn_start: "processing",
  },
  processing: {
    tool_execution_start: "running_tool",
    turn_end: "idle",
  },
  running_tool: {
    tool_execution_end: "processing",
    tool_permission_requested: "pending_approval",
  },
  pending_approval: {
    tool_permission_granted: "running_tool",
    tool_permission_denied: "processing",
  },
};

export type ActivityEvent =
  | "turn_start"
  | "turn_end"
  | "tool_execution_start"
  | "tool_execution_end"
  | "tool_permission_requested"
  | "tool_permission_granted"
  | "tool_permission_denied";

export interface ActivityTrackerDeps {
  onStateChange?: (state: ActivityStatus) => void;
  /** Injectable clock for testing. Defaults to () => new Date().toISOString() */
  now?: () => string;
}

export interface ActivityTracker {
  readonly current: ActivityStatus;
  snapshot(): ActivitySnapshot;
  handleEvent(event: ActivityEvent): void;
  onTurnStart(): void;
  onTurnEnd(): void;
  onToolExecutionStart(): void;
  onToolExecutionEnd(): void;
  onToolPermissionRequested(): void;
  onToolPermissionGranted(): void;
  onToolPermissionDenied(): void;
}

export function createActivityTracker(
  deps: ActivityTrackerDeps = {},
): ActivityTracker {
  const { onStateChange, now = () => new Date().toISOString() } = deps;

  let current: ActivityStatus = "idle";
  let lastEventTime = now();

  function handleEvent(event: ActivityEvent): void {
    const nextState = TRANSITIONS[current]?.[event];
    if (!nextState) return; // Invalid transition: ignore silently

    current = nextState;
    lastEventTime = now();
    onStateChange?.(current);
  }

  return {
    get current() {
      return current;
    },
    snapshot() {
      return { activity: current, lastEventTime };
    },
    handleEvent,
    onTurnStart() {
      handleEvent("turn_start");
    },
    onTurnEnd() {
      handleEvent("turn_end");
    },
    onToolExecutionStart() {
      handleEvent("tool_execution_start");
    },
    onToolExecutionEnd() {
      handleEvent("tool_execution_end");
    },
    onToolPermissionRequested() {
      handleEvent("tool_permission_requested");
    },
    onToolPermissionGranted() {
      handleEvent("tool_permission_granted");
    },
    onToolPermissionDenied() {
      handleEvent("tool_permission_denied");
    },
  };
}
