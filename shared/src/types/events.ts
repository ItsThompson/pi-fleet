import type { RegisteredSession } from "./session.js";
import type { Pod } from "./pod.js";
import type { ClusterDefinition } from "./cluster.js";

/**
 * Discriminated union of all SSE event types.
 * Use the `type` field for narrowing.
 */
export type SSEEvent =
  | { type: "session:added"; data: RegisteredSession }
  | { type: "session:updated"; data: RegisteredSession }
  | { type: "session:removed"; data: { sessionId: string } }
  | { type: "pod:formed"; data: Pod }
  | { type: "pod:updated"; data: Pod }
  | { type: "pod:dissolved"; data: { leadSessionId: string } }
  | { type: "cluster:created"; data: ClusterDefinition }
  | { type: "cluster:updated"; data: ClusterDefinition }
  | { type: "cluster:deleted"; data: { clusterId: string } }
  | { type: "cluster:reordered"; data: { orderedIds: string[] } }
  | {
      type: "cluster:assignment-changed";
      data: {
        sessionId: string;
        clusterId: string | null;
        reason: "manual" | "directory" | "none";
      };
    }
  | { type: "connected"; data: { serverTime: string } }
  | { type: "heartbeat"; data: Record<string, never> };

/** All possible SSE event type strings */
export type SSEEventType = SSEEvent["type"];
