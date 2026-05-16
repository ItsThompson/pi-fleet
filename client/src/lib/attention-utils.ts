import type { RegisteredSession } from "@pi-fleet/shared";
import { isAttentionState } from "@pi-fleet/shared";

// Re-export for convenience: consumers have one import source for all attention logic
export { isAttentionState };

/**
 * Get the timestamp when a session last changed to its current activity state.
 * Single source of truth for the stateChangedAt fallback chain.
 *
 * Priority:
 * 1. activityChangedAt map (client tracks transitions)
 * 2. session.lastSeen (server timestamp, always present)
 *
 * Never returns empty string: that would break date comparison logic.
 */
export function getStateChangedAt(
	sessionId: string,
	activityChangedAt: Map<string, string>,
	session: RegisteredSession,
): string {
	return activityChangedAt.get(sessionId) ?? session.lastSeen;
}

/**
 * Check if a specific session's attention state has been dismissed.
 * A session is dismissed when its dismissedStateChangedAt >= its current stateChangedAt.
 * If the session cycles (new state transition), stateChangedAt advances past the
 * dismissal timestamp and the session becomes visible again.
 */
export function isSessionDismissed(
	sessionId: string,
	activityChangedAt: Map<string, string>,
	session: RegisteredSession,
	dismissed: Map<string, { dismissedStateChangedAt: string }>,
): boolean {
	const record = dismissed.get(sessionId);
	if (!record) {
		return false;
	}
	const stateChangedAt = getStateChangedAt(
		sessionId,
		activityChangedAt,
		session,
	);
	return stateChangedAt <= record.dismissedStateChangedAt;
}

/**
 * Compute the count of sessions needing attention that haven't been dismissed.
 * Used by the Header bell badge.
 *
 * A session is "visible attention" when:
 * 1. Its activity is an attention state (isAttentionState)
 * 2. It has NOT been dismissed for its current state transition
 */
export function computeVisibleAttentionCount(
	sessions: Map<string, RegisteredSession>,
	activityChangedAt: Map<string, string>,
	dismissed: Map<string, { dismissedStateChangedAt: string }>,
): number {
	let count = 0;
	sessions.forEach((session, sessionId) => {
		if (!isAttentionState(session.activity)) {
			return;
		}
		if (isSessionDismissed(sessionId, activityChangedAt, session, dismissed)) {
			return;
		}
		count += 1;
	});
	return count;
}
