# 08: Session Data Model

## Overview

The pi-fleet extension collects richer session metadata than pi-watch. This section defines the extended registration and heartbeat payloads, plus how the extension gathers data from the pi API.

## ActivityStatus Enum

```typescript
// shared/src/types/session.ts

/**
 * Possible activity states for a pi session.
 * Ordered from lowest to highest priority for aggregation.
 */
type ActivityStatus =
	| "processing" // Agent is thinking (LLM call in flight)
	| "running_tool" // Agent is executing a tool
	| "idle" // Agent finished its turn, waiting for user input
	| "pending_approval"; // Agent is blocked by a tool-permission prompt
```

## Activity Tracker State Machine

The extension's `activity-tracker.ts` maintains a deterministic state machine driven by pi lifecycle events. The server never computes transitions: the extension reports the current state, and the server stores it.

### State Transition Table

| Current State      | Event                       | Next State         | Notes                                      |
| ------------------ | --------------------------- | ------------------ | ------------------------------------------ |
| `idle`             | `turn_start`                | `processing`       | User sent a message, agent begins thinking |
| `processing`       | `tool_execution_start`      | `running_tool`     | Agent decided to call a tool               |
| `processing`       | `turn_end`                  | `idle`             | Agent finished without calling tools       |
| `running_tool`     | `tool_execution_end`        | `processing`       | Tool completed, agent resumes thinking     |
| `running_tool`     | `tool_permission_requested` | `pending_approval` | Tool needs user approval                   |
| `pending_approval` | `tool_permission_granted`   | `running_tool`     | User approved, tool executes               |
| `pending_approval` | `tool_permission_denied`    | `processing`       | User denied, agent resumes thinking        |
| Any state          | `session_end`               | (unregisters)      | Session is over, remove from registry      |

### Transition Diagram

```
                    turn_start
        ┌────────────────────────────────────┐
        │                                    ▼
    ┌───────┐                         ┌────────────┐
    │ idle  │◄─── turn_end ───────────│ processing │
    └───────┘                         └─────┬──────┘
                                            │
                               tool_execution_start
                                            │
                                            ▼
                                     ┌──────────────┐
      ┌── tool_permission_requested──│ running_tool │◄──┐
      │                              └──────────────┘   │
      ▼                                                 │
┌──────────────────┐                                    │
│ pending_approval │─── permission_granted ──────────────┘
└──────────────────┘
        │
        └── permission_denied ──► processing
```

### Implementation

```typescript
// extension/src/activity-tracker.ts

interface ActivityTrackerDeps {
	onStateChange: (state: ActivityStatus) => void;
}

function createActivityTracker(deps: ActivityTrackerDeps) {
	let current: ActivityStatus = "idle";

	function transition(next: ActivityStatus): void {
		if (next !== current) {
			current = next;
			deps.onStateChange(current);
		}
	}

	return {
		get current(): ActivityStatus {
			return current;
		},

		onTurnStart(): void {
			transition("processing");
		},
		onTurnEnd(): void {
			transition("idle");
		},
		onToolExecutionStart(): void {
			transition("running_tool");
		},
		onToolExecutionEnd(): void {
			transition("processing");
		},
		onToolPermissionRequested(): void {
			transition("pending_approval");
		},
		onToolPermissionGranted(): void {
			transition("running_tool");
		},
		onToolPermissionDenied(): void {
			transition("processing");
		},
	};
}
```

### Invalid Transitions (Rejected)

The tracker ignores events that don't match the current state. For example:

- `tool_execution_end` while in `idle` → no-op
- `turn_start` while in `running_tool` → no-op
- `tool_permission_granted` while in `processing` → no-op

This prevents race conditions from out-of-order event delivery.

---

## Extended Registration Payload

```typescript
interface RegisterBody {
	sessionId: string;
	pid: number;
	cwd: string;
	tmuxTarget: string | null;
	startTime: string;
	agentName?: string;

	// NEW fields
	subagentId?: string; // process.env.SUBAGENT_ID (for pod correlation)
	model?: string; // Current model display name (e.g., "Claude Sonnet 4")
	contextUsage?: ContextUsagePayload; // Initial context state
	thinkingLevel?: string; // "off" | "low" | "medium" | "high"
}

interface ContextUsagePayload {
	/** Tokens used, or null if unknown (e.g., before first LLM call) */
	tokens: number | null;
	/** Total context window size */
	contextWindow: number;
	/** Percentage as integer 0-100, or null if tokens unknown */
	percent: number | null;
}
```

## Extended Heartbeat Payload

```typescript
interface HeartbeatBody {
	sessionId: string;
	activity: ActivityStatus;
	lastEventTime: string;
	tmuxTarget?: string | null;
	agentName?: string;

	// NEW fields
	model?: string; // Updated on model_select event
	contextUsage?: ContextUsagePayload; // Updated each heartbeat
	turnCount?: number; // Cumulative turn count this session
	thinkingLevel?: string; // Updated on change
	lastToolName?: string; // Most recent tool executed
}
```

## Extended RegisteredSession Type

```typescript
interface RegisteredSession {
	sessionId: string;
	pid: number;
	cwd: string;
	tmuxTarget: string | null;
	startTime: string;
	activity: ActivityStatus;
	lastSeen: string;
	lastEventTime: string;
	agentName?: string;

	// NEW fields
	subagentId?: string;
	model?: string;
	contextUsage?: ContextUsagePayload;
	turnCount?: number;
	thinkingLevel?: string;
	lastToolName?: string;
}
```

## Extension: Session Data Collector

The extension tracks rich metadata by listening to pi lifecycle events:

```typescript
// extension/src/session-data.ts

interface SessionData {
	model: string | null;
	contextUsage: ContextUsagePayload | null;
	turnCount: number;
	thinkingLevel: string;
	lastToolName: string | null;
}

function createSessionDataCollector(pi: ExtensionAPI): SessionData & {
	/** Get current snapshot for heartbeat */
	snapshot(): Partial<HeartbeatBody>;
} {
	const data: SessionData = {
		model: null,
		contextUsage: null,
		turnCount: 0,
		thinkingLevel: "off",
		lastToolName: null,
	};

	// Track model changes
	pi.on("model_select", async (event) => {
		data.model = event.model.name;
	});

	// Track turn count
	pi.on("turn_start", async () => {
		data.turnCount++;
	});

	// Track last tool used
	pi.on("tool_execution_end", async (event) => {
		data.lastToolName = event.toolName;
	});

	// Context usage is gathered at heartbeat time from ctx
	// (requires storing the ExtensionContext reference)

	return {
		...data,
		snapshot() {
			return {
				model: data.model ?? undefined,
				contextUsage: data.contextUsage ?? undefined,
				turnCount: data.turnCount,
				thinkingLevel: data.thinkingLevel,
				lastToolName: data.lastToolName ?? undefined,
			};
		},
	};
}
```

### Context Usage Collection

Context usage is read from `ctx.getContextUsage()` which is only available inside event handlers. The extension captures a reference to the `ExtensionContext` during `session_start` and reads context usage at heartbeat time:

```typescript
// In extension/src/index.ts

let extensionCtx: ExtensionContext | undefined;

pi.on("session_start", async (_event, ctx) => {
	extensionCtx = ctx;
	// ... registration logic
});

// In heartbeat snapshot:
function getContextUsage(): ContextUsagePayload | undefined {
	if (!extensionCtx) return undefined;
	const usage = extensionCtx.getContextUsage();
	if (!usage) return undefined;
	return {
		tokens: usage.tokens,
		contextWindow: usage.contextWindow,
		percent: usage.percent !== null ? Math.round(usage.percent) : null,
	};
}
```

### Thinking Level Collection

```typescript
// Thinking level isn't exposed via an event, but can be read from pi API
// at heartbeat time:
function getThinkingLevel(): string {
	return pi.getThinkingLevel(); // "off" | "low" | "medium" | "high"
}
```

## SSE Event Extension

The existing SSE events carry the full `RegisteredSession` object. Since the new fields are added to `RegisteredSession`, they automatically flow to the client via `session:added` and `session:updated` events without new event types.

## Server-Side Schema Updates

```typescript
// server/src/schemas.ts (extended)

const contextUsageSchema = z.object({
	tokens: z.number().nullable(),
	contextWindow: z.number(),
	percent: z.number().nullable(),
});

const registerBodySchema = z.object({
	sessionId: z.string(),
	pid: z.number(),
	cwd: z.string(),
	tmuxTarget: z.string().nullable(),
	startTime: z.string(),
	agentName: z.string().optional(),
	// NEW
	subagentId: z.string().optional(),
	model: z.string().optional(),
	contextUsage: contextUsageSchema.optional(),
	thinkingLevel: z.string().optional(),
});

const heartbeatBodySchema = z.object({
	sessionId: z.string(),
	activity: activitySchema,
	lastEventTime: z.string(),
	tmuxTarget: z.string().nullable().optional(),
	agentName: z.string().optional(),
	// NEW
	model: z.string().optional(),
	contextUsage: contextUsageSchema.optional(),
	turnCount: z.number().optional(),
	thinkingLevel: z.string().optional(),
	lastToolName: z.string().optional(),
});
```

## Session Registry Updates

The `heartbeat()` method must merge new fields:

```typescript
// In session-registry.ts heartbeat method, after existing field updates:
if (payload.model !== undefined) existing.model = payload.model;
if (payload.contextUsage !== undefined)
	existing.contextUsage = payload.contextUsage;
if (payload.turnCount !== undefined) existing.turnCount = payload.turnCount;
if (payload.thinkingLevel !== undefined)
	existing.thinkingLevel = payload.thinkingLevel;
if (payload.lastToolName !== undefined)
	existing.lastToolName = payload.lastToolName;
```

## Backward Compatibility

All new fields are optional. A pi-watch extension (old version) registering with the pi-fleet server will work fine: sessions just won't have model/context/turn data, and those fields display as "unknown" or hidden in the UI.

## Config Schema Version

All persistent config files include a `version` field for forward-compatible migrations:

```typescript
interface PiFleetConfig {
	/** Schema version. Increment on breaking format changes. */
	version: 1;
	/** User preferences */
	preferences: {
		ghostMode: boolean;
		ghostOpacity: number;
		soundEnabled: boolean;
	};
}

interface ClusterConfig {
	/** Schema version */
	version: 1;
	clusters: ClusterDefinition[];
	manualAssignments: Record<string, string>;
}
```

On load, if `version` is missing or less than current, the app runs a migration function before using the config. Migration functions are pure: `(oldConfig) => newConfig`.
