# 07: Attention System

## Overview

The attention system surfaces sessions that need user input. It manifests as badge counts (per-pod, per-cluster), clickable filter badges, and a global notification panel.

## Definition

A session "needs attention" when its activity state is:
- `pending_approval`: blocked by tool-permission prompt, agent cannot proceed
- `idle`: agent finished its turn, waiting for user to provide next instruction

## Badge Counts

### Hierarchy

```
Cluster Badge = Σ(pod badges within cluster)
Pod Badge = count of member sessions needing attention
Session = individual attention indicator (dot color)
```

### Rendering Rules

| Count | Badge Display |
|-------|--------------|
| 0 | Hidden (no badge shown) |
| 1-9 | Numeric badge |
| 10+ | "9+" badge |

### Implementation

```typescript
// Computed in pod-store.ts and cluster-store.ts (client-side)

function computePodAttentionCount(pod: Pod, sessions: RegisteredSession[]): number {
  const members = sessions.filter(s => pod.memberSessionIds.includes(s.sessionId));
  return members.filter(s => s.activity === "pending_approval" || s.activity === "idle").length;
}

function computeClusterAttentionCount(
  clusterId: string | null,
  pods: Pod[],
  podAttention: Map<string, number>,
): number {
  const clusterPods = pods.filter(p => getClusterForPod(p) === clusterId);
  return clusterPods.reduce((sum, pod) => sum + (podAttention.get(pod.leadSessionId) ?? 0), 0);
}
```

## Filter Badges

Filter badges appear in the header area of cluster and pod views. They allow filtering the card grid by state.

### UI Layout

```
┌─────────────────────────────────────────────────────┐
│ Cluster: Work                                       │
│ ~/workplace/ · 2 manual                             │
│                                                     │
│ [🔴 Needs Approval (2)] [🟡 Idle (3)] [🟢 Working (5)] │
│                                                     │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│ │ Pod A   │ │ Pod B   │ │ Pod C   │ │ Pod D   │   │
│ │ ...     │ │ ...     │ │ ...     │ │ ...     │   │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
└─────────────────────────────────────────────────────┘
```

### Behavior

| Action | Result |
|--------|--------|
| Click "Needs Approval" badge | Toggle filter: show only pods/sessions with `pending_approval` |
| Click "Idle" badge | Toggle filter: show only pods/sessions with `idle` state |
| Click "Working" badge | Toggle filter: show only `processing` or `running_tool` |
| Click active badge again | Clear that filter |
| Multiple badges active | OR logic: show items matching ANY active filter |
| No badges active | Show all items (default) |

### State Design

```typescript
// client/src/stores/filter-store.ts

interface FilterState {
  /** Active state filters (empty = show all) */
  activeFilters: Set<ActivityStatus>;

  /** Toggle a filter on/off */
  toggleFilter: (status: ActivityStatus) => void;

  /** Clear all filters */
  clearFilters: () => void;

  /** Check if a session passes current filters */
  passesFilter: (session: RegisteredSession) => boolean;

  /** Check if a pod passes current filters (any member matches) */
  podPassesFilter: (pod: Pod, sessions: RegisteredSession[]) => boolean;
}
```

## Notification Panel

A global panel showing all sessions needing attention across all clusters and pods.

### Access

- Bell icon in the app header
- Badge on the bell icon shows total attention count across everything
- Click to toggle panel visibility

### Layout

```
┌─────────────────────────────────────────┐
│ 🔔 Notifications (5)            [Close] │
├─────────────────────────────────────────┤
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🔴 pi-fleet-refactor               │ │
│ │    Pod: Work/main-agent             │ │
│ │    Waiting for approval · 2m ago    │ │
│ │                         [Open ↗]    │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🟡 test-runner                      │ │
│ │    Pod: Work/test-suite             │ │
│ │    Idle · 5m ago                    │ │
│ │                         [Open ↗]    │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🟡 docs-writer                     │ │
│ │    Unclustered                      │ │
│ │    Idle · 12m ago                   │ │
│ │                         [Open ↗]    │ │
│ └─────────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

### Data Shape

```typescript
interface NotificationEntry {
  sessionId: string;
  sessionName: string;
  /** The pod this session belongs to */
  podDisplayName: string;
  /** The cluster the pod is in (null = unclustered) */
  clusterName: string | null;
  /** Current attention state */
  state: "pending_approval" | "idle";
  /** When the session entered this state */
  stateChangedAt: string;  // ISO timestamp
}
```

### Ordering

Reverse chronological by `stateChangedAt` (most recently attention-needing first).

### Live Updates

- Entry appears when a session transitions to attention state
- Entry disappears when a session leaves attention state (e.g., user approves tool, provides input)
- All updates via SSE: no polling

### Interaction

| Action | Result |
|--------|--------|
| Click "Open" button on entry | Opens that session in terminal (same as clicking session card) |
| Session leaves attention state | Entry fades out / removes from list |
| New session enters attention state | Entry appears at top of list |

## SSE Events

The attention system is reactive: it derives entirely from session state changes already broadcast via SSE. No new server-side events needed specifically for attention: the client computes attention from `session:added`, `session:updated`, and `session:removed` events.

The client needs to track `stateChangedAt` locally:

```typescript
// In session-store.ts: track when activity last changed
interface SessionWithMeta extends RegisteredSession {
  /** When activity last changed (client-tracked for notification ordering) */
  activityChangedAt: string;
}
```

## Sound Integration

When a session transitions to `pending_approval` or `idle`:
- If sound is enabled: play attention sound
- Sound is the existing pi-watch sound system (carried over in fork)
- One sound per transition (not per heartbeat that confirms the state)
