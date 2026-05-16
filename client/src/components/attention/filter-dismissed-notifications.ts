import type { NotificationEntry } from "./types";
import type { DismissedNotification } from "@/stores/notification-dismiss-store";

/**
 * Filters notification entries, removing those that are currently dismissed.
 * A dismissed entry reappears if its stateChangedAt is newer than the
 * stored dismissedStateChangedAt (the session has cycled since dismissal).
 */
export function filterDismissedNotifications(
	entries: NotificationEntry[],
	dismissed: Map<string, DismissedNotification>,
): NotificationEntry[] {
	if (dismissed.size === 0) {
		return entries;
	}

	return entries.filter((entry) => {
		const record = dismissed.get(entry.sessionId);
		if (!record) {
			return true;
		}
		// Keep the entry if its state timestamp is newer than when it was dismissed
		return entry.stateChangedAt > record.dismissedStateChangedAt;
	});
}
