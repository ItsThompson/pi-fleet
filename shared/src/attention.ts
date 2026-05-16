import type { ActivityStatus } from "./types/session.js";

/**
 * Activity states that constitute "needs attention":
 * the session requires human intervention to proceed.
 */
export const ATTENTION_STATES: ReadonlySet<ActivityStatus> = new Set([
  "pending_approval",
  "idle",
]);

/**
 * Check whether an activity status requires human attention.
 * This is the single source of truth for the attention classification.
 */
export function isAttentionState(status: ActivityStatus): boolean {
  return ATTENTION_STATES.has(status);
}
