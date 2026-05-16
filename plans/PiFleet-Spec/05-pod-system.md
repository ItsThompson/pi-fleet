# 05: Pod System

## Overview

A Pod is a computed grouping of a parent session and its subagent children. Pods are never explicitly created or destroyed by users: they emerge from session registration and ownership reports.

## Inter-Extension Communication Protocol

### Participants

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│ pi-fleet extension          │     │ subagent-orchestrator        │
│ (depends on orchestrator)   │     │ (zero knowledge of pi-fleet) │
│                             │     │                             │
│ LISTENS:                    │     │ EMITS:                      │
│ • registry-updated (signal) │     │ • registry-updated          │
│ • registry-response (data)  │     │ • registry-response         │
│                             │     │                             │
│ EMITS:                      │     │ LISTENS:                    │
│ • request-subagent-registry │     │ • request-subagent-registry │
└─────────────────────────────┘     └─────────────────────────────┘
```

### Event Definitions

```typescript
// Signal: "something changed in the subagent registry"
// Emitted by: subagent-orchestrator (on broker register/disconnect/status-change)
// Payload: none
type RegistryUpdatedEvent = "subagent-orchestrator:registry-updated";

// Request: "please send me the current registry state"
// Emitted by: pi-fleet extension
// Payload: none
type RequestRegistryEvent = "pi-fleet:request-subagent-registry";

// Response: "here are the current subagent IDs"
// Emitted by: subagent-orchestrator
// Payload: { subagentIds: string[] }
type RegistryResponseEvent = "subagent-orchestrator:registry-response";

interface RegistryResponsePayload {
	subagentIds: string[];
}
```

### Sequence Diagram

```
subagent-orchestrator          pi.events          pi-fleet extension
        │                         │                       │
        │  (broker registers      │                       │
        │   a new subagent)       │                       │
        │                         │                       │
        ├──emit("registry-updated")──────────────────────►│
        │                         │                       │
        │◄───emit("request-subagent-registry")────────────┤
        │                         │                       │
        ├──emit("registry-response", {subagentIds})──────►│
        │                         │                       │
        │                         │    POST /api/pods/ownership
        │                         │    { parentSessionId,
        │                         │      subagentIds: [...] }
        │                         │                       │
```

### Startup Catch-Up

On `session_start`, the pi-fleet extension emits `"pi-fleet:request-subagent-registry"`:

- If subagent-orchestrator is loaded and has subagents: responds with current state.
- If subagent-orchestrator is not loaded: event goes unanswered. Graceful: all sessions are single-member pods.

### pi-fleet Extension: Pod Reporter

```typescript
// extension/src/pod-reporter.ts

interface PodReporterDeps {
	events: EventBus; // pi.events
	sessionId: string; // this session's ID
	postOwnership: (
		parentSessionId: string,
		subagentIds: string[],
	) => Promise<void>;
}

function createPodReporter(deps: PodReporterDeps) {
	const { events, sessionId, postOwnership } = deps;

	// Listen for the signal
	events.on("subagent-orchestrator:registry-updated", () => {
		events.emit("pi-fleet:request-subagent-registry", undefined);
	});

	// Listen for the response
	events.on("subagent-orchestrator:registry-response", (data: unknown) => {
		const { subagentIds } = data as RegistryResponsePayload;
		postOwnership(sessionId, subagentIds);
	});

	return {
		/** Request current state (called on session_start) */
		requestInitialState() {
			events.emit("pi-fleet:request-subagent-registry", undefined);
		},
	};
}
```

### Subagent-Orchestrator: Response Handler

This handler must be added to the subagent-orchestrator extension. It's the ONLY modification needed:

```typescript
// In subagent-orchestrator/index.ts (or a new file)

pi.events.on("pi-fleet:request-subagent-registry", () => {
	const ids = [...broker.entries.keys()];
	pi.events.emit("subagent-orchestrator:registry-response", {
		subagentIds: ids,
	});
});
```

## Correlation

Child sessions include `subagentId` in their registration payload:

```typescript
// In pi-fleet extension (child process):
const subagentId = process.env.SUBAGENT_ID; // Set by spawn-config.ts, never changes

await client.register({
	sessionId,
	pid: process.pid,
	cwd,
	tmuxTarget,
	startTime: new Date().toISOString(),
	agentName: pi.getSessionName() ?? undefined,
	subagentId: subagentId ?? undefined, // NEW field
});
```

Server matches ownership report's `subagentIds` array against registered sessions' `subagentId` field.

## Server: Pod Registry

```typescript
// server/src/pod-registry.ts

interface Pod {
  /** Lead session ID (the parent, or the sole member for single-member pods) */
  leadSessionId: string;
  /** All member session IDs (includes lead) */
  memberSessionIds: string[];
  /** Computed display name */
  displayName: string;
  /** Aggregated state (worst among members) */
  state: ActivityStatus;
  /** Count of members needing attention */
  attentionCount: number;
}

interface PodRegistryDeps {
  sessionRegistry: SessionRegistry;
  onChange: (pods: Pod[]) => void;
}

function createPodRegistry(deps: PodRegistryDeps) {
  // Ownership map: parentSessionId → subagentIds
  const ownershipMap = new Map<string, string[]>();

  return {
    /** Called when a parent reports its subagent IDs */
    reportOwnership(parentSessionId: string, subagentIds: string[]): void;

    /** Called when a session is removed (handle parent death) */
    handleSessionRemoved(sessionId: string): void;

    /** Get all computed pods */
    getPods(): Pod[];

    /** Get the pod containing a specific session */
    getPodForSession(sessionId: string): Pod | undefined;
  };
}
```

## Pod State Aggregation

Priority ordering (highest = worst = shown on pod):

```
pending_approval  (4)  ← blocked, needs human
idle              (3)  ← waiting for input
running_tool      (2)  ← actively working
processing        (1)  ← thinking
```

```typescript
const STATE_PRIORITY: Record<ActivityStatus, number> = {
	pending_approval: 4,
	idle: 3,
	running_tool: 2,
	processing: 1,
};

function aggregatePodState(members: RegisteredSession[]): ActivityStatus {
	return members.reduce(
		(worst, member) =>
			STATE_PRIORITY[member.activity] > STATE_PRIORITY[worst]
				? member.activity
				: worst,
		"processing" as ActivityStatus,
	);
}
```

## Pod Lifecycle

| Event                               | Pod Behavior                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| Session registers (no subagentId)   | New single-member pod created                                                     |
| Session registers (with subagentId) | Session waits for parent to claim it; rendered as single-member pod until claimed |
| Parent reports ownership            | Matching sessions group under parent's pod; single-member pods dissolve           |
| Parent session dies                 | Children become independent single-member pods (promoted to standalone)           |
| Child session dies                  | Removed from parent's pod; if parent remains, pod continues                       |
| All members die                     | Pod ceases to exist                                                               |

## Graceful Degradation

| Scenario                                | Behavior                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| subagent-orchestrator not installed     | `registry-updated` never fires; all sessions are single-member pods                                |
| pi-fleet extension not installed        | Orchestrator emits events to nobody; no effect                                                     |
| Orchestrator loaded after pi-fleet      | Startup catch-up request goes unanswered; once orchestrator spawns a subagent, normal flow resumes |
| Child registers before parent claims it | Rendered as standalone; once claimed, moves into parent's pod                                      |
