import type { Pod, RegisteredSession } from "@pi-fleet/shared";
import { isAttentionState } from "@pi-fleet/shared";
import { useFilterStore } from "@/stores/filter-store";
import { useSessionStore } from "@/stores/session-store";

export interface FilteredGridResult<T> {
	/** Items in attention state (pending_approval or idle) */
	attentionItems: T[];
	/** Items in working state */
	workingItems: T[];
	/** Total items before filtering */
	totalCount: number;
	/** Items after filtering */
	filteredCount: number;
}

/**
 * Filter and split pods into attention/working groups.
 * Reads filter state from useFilterStore.
 * Reads session data from useSessionStore for pod member filtering.
 */
export function useFilteredPods(pods: Pod[]): FilteredGridResult<Pod> {
	const activeFilters = useFilterStore((state) => state.activeFilters);
	const podPassesFilter = useFilterStore((state) => state.podPassesFilter);
	const sessions = useSessionStore((state) => state.sessions);

	const totalCount = pods.length;

	const filteredPods =
		activeFilters.size > 0
			? pods.filter((pod) => podPassesFilter(pod, sessions))
			: pods;

	const attentionItems: Pod[] = [];
	const workingItems: Pod[] = [];

	filteredPods.forEach((pod) => {
		if (isAttentionState(pod.state)) {
			attentionItems.push(pod);
		} else {
			workingItems.push(pod);
		}
	});

	return {
		attentionItems,
		workingItems,
		totalCount,
		filteredCount: filteredPods.length,
	};
}

/**
 * Filter and split sessions into attention/working groups.
 * Used by PodView which operates on sessions, not pods.
 */
export function useFilteredSessions(
	sessions: RegisteredSession[],
): FilteredGridResult<RegisteredSession> {
	const activeFilters = useFilterStore((state) => state.activeFilters);
	const passesFilter = useFilterStore((state) => state.passesFilter);

	const totalCount = sessions.length;

	const filteredSessions =
		activeFilters.size > 0
			? sessions.filter((session) => passesFilter(session))
			: sessions;

	const attentionItems: RegisteredSession[] = [];
	const workingItems: RegisteredSession[] = [];

	filteredSessions.forEach((session) => {
		if (isAttentionState(session.activity)) {
			attentionItems.push(session);
		} else {
			workingItems.push(session);
		}
	});

	return {
		attentionItems,
		workingItems,
		totalCount,
		filteredCount: filteredSessions.length,
	};
}
