import { useEffect, useRef, useCallback, useState } from "react";
import type { SSEEvent, RegisteredSession, Pod, ClusterDefinition } from "@pi-fleet/shared";
import { useSessionStore } from "@/stores/session-store";
import { usePodStore } from "@/stores/pod-store";
import { useClusterStore } from "@/stores/cluster-store";

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;

export interface SSEConnectionState {
  connected: boolean;
  reconnecting: boolean;
  attemptCount: number;
}

function getBaseUrl(): string {
  // In production (Electron), use the server URL from the bridge
  if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).piFleet) {
    return (window as unknown as { piFleet: { getServerUrl: () => string } }).piFleet.getServerUrl();
  }
  // In development, rely on Vite proxy
  return "";
}

async function fetchSessions(baseUrl: string): Promise<RegisteredSession[]> {
  const response = await fetch(`${baseUrl}/api/sessions`);
  if (!response.ok) return [];
  const data = await response.json();
  return data.sessions ?? [];
}

async function fetchPods(baseUrl: string): Promise<Pod[]> {
  const response = await fetch(`${baseUrl}/api/pods`);
  if (!response.ok) return [];
  const data = await response.json();
  return data.pods ?? [];
}

async function fetchClusters(baseUrl: string): Promise<void> {
  const { setClusters } = useClusterStore.getState();
  try {
    const response = await fetch(`${baseUrl}/api/clusters`);
    if (!response.ok) return;
    const data = await response.json();
    setClusters(
      data.clusters ?? [],
      data.unclustered ?? { podIds: [], attentionCount: 0 },
    );
  } catch {
    // Ignore fetch errors on reconnect
  }
}

export function useSSE(): SSEConnectionState {
  const [connectionState, setConnectionState] = useState<SSEConnectionState>({
    connected: false,
    reconnecting: false,
    attemptCount: 0,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptCountRef = useRef(0);
  const mountedRef = useRef(true);

  const handleEvent = useCallback((eventType: string, data: unknown) => {
    const { addSession, updateSession, removeSession } = useSessionStore.getState();
    const { addOrUpdatePod, removePod } = usePodStore.getState();
    const {
      addCluster,
      updateCluster,
      removeCluster,
      reorderClusters,
      handleAssignmentChanged,
    } = useClusterStore.getState();

    switch (eventType) {
      case "session:added":
        addSession(data as RegisteredSession);
        break;
      case "session:updated":
        updateSession(data as RegisteredSession);
        break;
      case "session:removed":
        removeSession((data as { sessionId: string }).sessionId);
        break;
      case "pod:formed":
      case "pod:updated":
        addOrUpdatePod(data as Pod);
        break;
      case "pod:dissolved":
        removePod((data as { leadSessionId: string }).leadSessionId);
        break;
      case "cluster:created":
        addCluster(data as ClusterDefinition);
        break;
      case "cluster:updated":
        updateCluster(data as ClusterDefinition);
        break;
      case "cluster:deleted":
        removeCluster((data as { clusterId: string }).clusterId);
        break;
      case "cluster:reordered":
        reorderClusters((data as { orderedIds: string[] }).orderedIds);
        break;
      case "cluster:assignment-changed": {
        const payload = data as { sessionId: string; clusterId: string | null };
        handleAssignmentChanged(payload.sessionId, payload.clusterId);
        break;
      }
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const baseUrl = getBaseUrl();
    const eventSource = new EventSource(`${baseUrl}/api/events`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      if (!mountedRef.current) return;
      attemptCountRef.current = 0;
      setConnectionState({ connected: true, reconnecting: false, attemptCount: 0 });
    };

    // Listen for named events
    const eventTypes = [
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

    eventTypes.forEach((type) => {
      eventSource.addEventListener(type, (event: MessageEvent) => {
        if (!mountedRef.current) return;

        try {
          const data = JSON.parse(event.data);

          if (type === "connected") {
            // On connect: full state refetch
            refetchState(baseUrl);
            return;
          }

          if (type === "heartbeat") return;

          handleEvent(type, data);
        } catch {
          // Ignore parse errors
        }
      });
    });

    eventSource.onerror = () => {
      if (!mountedRef.current) return;

      eventSource.close();
      eventSourceRef.current = null;

      attemptCountRef.current += 1;
      const attempt = attemptCountRef.current;

      setConnectionState({
        connected: false,
        reconnecting: true,
        attemptCount: attempt,
      });

      // Exponential backoff: 1s, 2s, 4s, 8s, ..., max 30s
      const delay = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1), MAX_BACKOFF_MS);
      retryTimeoutRef.current = setTimeout(connect, delay);
    };
  }, [handleEvent]);

  const refetchState = useCallback(async (baseUrl: string) => {
    const { setSessions } = useSessionStore.getState();
    const { setPods } = usePodStore.getState();

    const [sessions, pods] = await Promise.all([
      fetchSessions(baseUrl),
      fetchPods(baseUrl),
    ]);

    if (mountedRef.current) {
      setSessions(sessions);
      setPods(pods);
      // Also refetch clusters on reconnect
      fetchClusters(baseUrl);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [connect]);

  return connectionState;
}
