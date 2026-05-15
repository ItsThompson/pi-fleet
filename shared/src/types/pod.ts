import type { ActivityStatus } from "./session.js";

export interface Pod {
  /** Lead session ID (the parent, or the sole member for single-member pods) */
  leadSessionId: string;
  /** All member session IDs (includes lead) */
  memberSessionIds: string[];
  /** Computed display name */
  displayName: string;
  /** Aggregated state (worst among members) */
  state: ActivityStatus;
  /** Count of members needing attention */
  attentionCount: number;
}

/**
 * Priority ordering for state aggregation.
 * Higher number = "worse" state shown on pod.
 */
export const STATE_PRIORITY: Record<ActivityStatus, number> = {
  processing: 1,
  running_tool: 2,
  idle: 3,
  pending_approval: 4,
};
