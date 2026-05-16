/**
 * Refetch all state from the server.
 * Called on SSE reconnect to ensure client state is consistent.
 */
import { useSessionStore } from "@/stores/session-store";
import { usePodStore } from "@/stores/pod-store";
import { useClusterStore } from "@/stores/cluster-store";
import { fetchClusters as apiFetchClusters } from "@/api/cluster-api";
import type { RegisteredSession, Pod } from "@pi-fleet/shared";

export async function refetchAllState(baseUrl: string): Promise<void> {
	try {
		const [sessionsRes, podsRes] = await Promise.all([
			fetch(`${baseUrl}/api/sessions`).then((r) =>
				r.ok ? r.json() : { sessions: [] },
			),
			fetch(`${baseUrl}/api/pods`).then((r) =>
				r.ok ? r.json() : { pods: [] },
			),
		]);

		useSessionStore
			.getState()
			.setSessions((sessionsRes.sessions ?? []) as RegisteredSession[]);
		usePodStore.getState().setPods((podsRes.pods ?? []) as Pod[]);
		await refetchClusters(baseUrl);
	} catch {
		// Ignore fetch errors during reconnect: stale state is acceptable
	}
}

export async function refetchClusters(baseUrl: string): Promise<void> {
	const result = await apiFetchClusters(baseUrl);
	if (result.ok) {
		useClusterStore
			.getState()
			.setClusters(
				result.data.clusters ?? [],
				result.data.unclustered ?? { podIds: [], attentionCount: 0 },
			);
	}
}
