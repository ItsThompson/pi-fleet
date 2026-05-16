# 09: Communication Interfaces

## Overview

This section catalogs all inter-component communication: HTTP API endpoints, Electron IPC channels, and SSE event types. It serves as the single source of truth for the contract between packages.

---

## HTTP API Endpoints

Base URL: `http://127.0.0.1:8314/api`

### Sessions

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sessions/register` | Register a new session |
| POST | `/api/sessions/:id/heartbeat` | Update session state |
| POST | `/api/sessions/:id/unregister` | Graceful session removal |
| GET | `/api/sessions` | List all active sessions (used on client connect + SSE reconnect) |

#### POST /api/sessions/register

```typescript
// Request
interface RegisterBody {
  sessionId: string;
  pid: number;
  cwd: string;
  tmuxTarget: string | null;
  startTime: string;           // ISO 8601
  agentName?: string;
  subagentId?: string;
  model?: string;
  contextUsage?: ContextUsagePayload;
  thinkingLevel?: string;
}

// Response: 201 Created
interface RegisterResponse {
  ok: true;
}
```

#### POST /api/sessions/:id/heartbeat

```typescript
// Request
interface HeartbeatBody {
  sessionId: string;
  activity: ActivityStatus;
  lastEventTime: string;
  tmuxTarget?: string | null;
  agentName?: string;
  model?: string;
  contextUsage?: ContextUsagePayload;
  turnCount?: number;
  thinkingLevel?: string;
  lastToolName?: string;
}

// Response: 200 OK
interface HeartbeatResponse {
  ok: true;
}

// Response: 404 (session not found — race condition, re-register)
```

#### POST /api/sessions/:id/unregister

```typescript
// Request: empty body (session ID in URL)

// Response: 200 OK
interface UnregisterResponse {
  ok: true;
}

// Response: 404 (already gone — idempotent, safe to ignore)
```

#### GET /api/sessions

```typescript
// Response: 200 OK
interface SessionsListResponse {
  sessions: RegisteredSession[];
}
```

### Pods

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/pods` | List all computed pods with membership |
| POST | `/api/pods/ownership` | Report parent's subagent ownership |

#### GET /api/pods

```typescript
// Response: 200 OK
interface PodsListResponse {
  pods: Pod[];
}
```

#### POST /api/pods/ownership

```typescript
// Request
interface OwnershipReportBody {
  parentSessionId: string;
  subagentIds: string[];
}

// Response: 200 OK
interface OwnershipResponse {
  ok: true;
  /** IDs that matched registered sessions */
  matchedIds: string[];
  /** IDs that did not match any registered session (yet) */
  unmatchedIds: string[];
}
```

### Clusters

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/clusters` | List all clusters with current pod membership |
| POST | `/api/clusters` | Create a new cluster |
| PATCH | `/api/clusters/:id` | Update name or directories |
| DELETE | `/api/clusters/:id` | Delete a cluster |
| POST | `/api/clusters/reorder` | Update sort order |
| POST | `/api/clusters/assign` | Manually assign a session to a cluster |

Schemas defined in [06-cluster-system.md](./06-cluster-system.md#api-endpoints).

#### GET /api/clusters

```typescript
// Response: 200 OK
interface ClustersListResponse {
  clusters: Array<ClusterDefinition & {
    /** Pod IDs currently assigned to this cluster */
    podIds: string[];
    /** Total attention count across all pods in this cluster */
    attentionCount: number;
  }>;
  /** Pods not assigned to any cluster */
  unclustered: {
    podIds: string[];
    attentionCount: number;
  };
}
```

### Terminal

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/open-terminal` | Resolve session to tmux target for opening |

#### POST /api/open-terminal

```typescript
// Request
interface OpenTerminalBody {
  sessionId: string;
}

// Response: 200 OK (returns target info for desktop to execute)
interface OpenTerminalResponse {
  tmuxTarget: string;         // e.g., "main:1.0"
  terminalApp?: string;       // Detected app name, if known
}

// Response: 404 (session not found)
// Response: 400 (session has no tmux target)
```

### Events (SSE)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events` | Server-Sent Events stream |

#### GET /api/events

Connection semantics:
- Client opens connection, receives real-time events
- Server sends `event: connected` with initial state summary on connect
- On disconnect: client reconnects with exponential backoff (1s, 2s, 4s, max 30s)
- On reconnect: client calls `GET /api/sessions` + `GET /api/pods` + `GET /api/clusters` for full state recovery

```typescript
// Initial event on connection
// event: connected
// data: { serverTime: string }
```

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |

#### GET /api/health

```typescript
// Response: 200 OK
interface HealthResponse {
  status: "ok";
  uptime: number;           // seconds
  sessions: number;         // active session count
  pods: number;             // active pod count
  version: string;          // app version
}
```

---

## Electron IPC Channels

Communication between the Electron main process and the renderer (React client) via the preload context bridge.

### Preload Context Bridge

```typescript
// desktop/src/preload.ts — exposed as window.piFleet

interface PiFleetBridge {
  /** Open a session's tmux pane and activate terminal window */
  openSession(sessionId: string): Promise<OpenResult>;

  /** Get app config (ghost mode, sound, etc.) */
  getConfig(): Promise<PiFleetConfig>;

  /** Update a config preference */
  setConfig(key: string, value: unknown): Promise<void>;

  /** Subscribe to overlay visibility changes */
  onVisibilityChange(callback: (visible: boolean) => void): () => void;

  /** Get the server base URL (for SSE/HTTP connections) */
  getServerUrl(): string;

  /** App version for display */
  getVersion(): string;
}
```

### IPC Channel Map

| Channel | Direction | Payload | Purpose |
|---------|-----------|---------|---------|
| `pf:open-session` | renderer → main | `{ sessionId: string }` | Trigger terminal open flow |
| `pf:open-session:result` | main → renderer | `OpenResult` | Terminal open result |
| `pf:get-config` | renderer → main | none | Request current config |
| `pf:set-config` | renderer → main | `{ key: string, value: unknown }` | Update preference |
| `pf:visibility-changed` | main → renderer | `{ visible: boolean }` | Overlay shown/hidden |
| `pf:attention-sound` | main → renderer | `{ sessionId: string }` | Sound trigger notification |

### IPC Prefix Convention

All channels use the `pf:` prefix (pi-fleet). This avoids collisions with Electron built-in channels and clearly identifies app-specific communication.

---

## SSE Event Catalog

All events follow the Server-Sent Events format: `event: <type>\ndata: <json>\n\n`

### Session Events

| Event Type | Trigger | Payload |
|------------|---------|---------|
| `session:added` | New session registered | `RegisteredSession` |
| `session:updated` | Heartbeat received with state change | `RegisteredSession` |
| `session:removed` | Session unregistered or reaped | `{ sessionId: string }` |

### Pod Events

| Event Type | Trigger | Payload |
|------------|---------|---------|
| `pod:formed` | Ownership report groups sessions | `Pod` |
| `pod:updated` | Member added/removed or state changed | `Pod` |
| `pod:dissolved` | All members removed | `{ leadSessionId: string }` |

### Cluster Events

| Event Type | Trigger | Payload |
|------------|---------|---------|
| `cluster:created` | User creates cluster | `ClusterDefinition` |
| `cluster:updated` | Name or directories edited | `ClusterDefinition` |
| `cluster:deleted` | User deletes cluster | `{ clusterId: string }` |
| `cluster:reordered` | Clusters reordered | `{ orderedIds: string[] }` |
| `cluster:assignment-changed` | Session assigned/unassigned | `{ sessionId: string, clusterId: string \| null, reason: "manual" \| "directory" \| "none" }` |

### System Events

| Event Type | Trigger | Payload |
|------------|---------|---------|
| `connected` | SSE connection established | `{ serverTime: string }` |
| `heartbeat` | Keep-alive (every 30s) | `{}` |

### Event Delivery Guarantees

- Events are fire-and-forget: no acknowledgment, no replay.
- If the SSE connection drops, the client does a full state refetch on reconnect (`GET /api/sessions` + `GET /api/pods` + `GET /api/clusters`).
- The `heartbeat` event (every 30s) acts as a keep-alive to detect stale connections.

### TypeScript Union Type

```typescript
// shared/src/types/events.ts

type SSEEvent =
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
  | { type: "cluster:assignment-changed"; data: { sessionId: string; clusterId: string | null; reason: "manual" | "directory" | "none" } }
  | { type: "connected"; data: { serverTime: string } }
  | { type: "heartbeat"; data: Record<string, never> }
;
```
