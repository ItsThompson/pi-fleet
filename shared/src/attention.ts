import type { ActivityStatus } from "./types/session.js";

/** Activity states that require human attention. */
export type AttentionStatus = "pending_approval" | "idle";

/**
 * Activity states that constitute "needs attention":
 * the session requires human intervention to proceed.
 */
export const ATTENTION_STATES: ReadonlySet<ActivityStatus> =
	new Set<AttentionStatus>(["pending_approval", "idle"]);

/**
 * Check whether an activity status requires human attention.
 * This is the single source of truth for the attention classification.
 * Acts as a type guard narrowing ActivityStatus to AttentionStatus.
 */
export function isAttentionState(
	status: ActivityStatus,
): status is AttentionStatus {
	return ATTENTION_STATES.has(status);
}
