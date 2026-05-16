import { useEffect, useRef, useState } from "react";
import {
	createSSEConnection,
	type ConnectionState,
} from "@/lib/sse-connection";
import { createSSEDispatcher } from "@/lib/sse-dispatcher";
import { getServerUrl } from "@/lib/bridge";
import { refetchAllState, refetchClusters } from "@/lib/sse-refetch";

export type SSEConnectionState = ConnectionState;

const EVENT_TYPES = [
	"connected",
	"session:added",
	"session:updated",
	"session:removed",
	"pod:formed",
	"pod:updated",
	"pod:dissolved",
	"cluster:created",
	"cluster:updated",
	"cluster:deleted",
	"cluster:reordered",
	"cluster:assignment-changed",
	"heartbeat",
];

export function useSSE(): SSEConnectionState {
	const [state, setState] = useState<ConnectionState>({
		connected: false,
		reconnecting: false,
		attemptCount: 0,
	});
	const connectionRef = useRef<ReturnType<typeof createSSEConnection> | null>(
		null,
	);

	useEffect(() => {
		const baseUrl = getServerUrl();
		const dispatcher = createSSEDispatcher({
			onConnected: () => refetchAllState(baseUrl),
			onAssignmentChanged: () => refetchClusters(baseUrl),
		});

		const connection = createSSEConnection({
			url: `${baseUrl}/api/events`,
			eventTypes: EVENT_TYPES,
			onEvent: dispatcher.dispatch,
			onStateChange: setState,
		});

		connectionRef.current = connection;
		connection.connect();

		return () => {
			connection.close();
			connectionRef.current = null;
		};
	}, []);

	return state;
}
