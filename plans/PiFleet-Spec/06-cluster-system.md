# 06: Cluster System

## Overview

Clusters are user-created, persistent organizational groupings. They bind to directories for auto-assignment and support manual drag-and-drop override. Clusters persist in a JSON config file and survive app restarts even when empty.

## Persistence Format

File: `~/Library/Application Support/PiFleet/config.json`

```typescript
interface ClusterConfig {
  /** Ordered list of user-created clusters */
  clusters: ClusterDefinition[];
  /** Manual overrides: sessionId → clusterId */
  manualAssignments: Record<string, string>;
}

interface ClusterDefinition {
  /** Stable UUID */
  id: string;
  /** User-visible name */
  name: string;
  /** Directories that auto-assign pods to this cluster (tilde-expanded) */
  directories: string[];
  /** Sort position (lower = higher in sidebar) */
  sortOrder: number;
}
```

Example:

```json
{
  "clusters": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "Work",
      "directories": ["~/workplace/", "~/Documents/projects/"],
      "sortOrder": 0
    },
    {
      "id": "f9e8d7c6-b5a4-3210-fedc-ba0987654321",
      "name": "Personal",
      "directories": ["~/personal/", "~/Documents/pi-fleet/"],
      "sortOrder": 1
    }
  ],
  "manualAssignments": {
    "session-abc-123": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

## Assignment Logic

```
┌────────────────────────────────────────────────────────┐
│ Session registers with cwd = "~/workplace/project-a/"  │
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│ Check manualAssignments[sessionId]                      │
│ → If found: assign to that cluster (done)              │
└────────────────────────┬───────────────────────────────┘
                         │ not found
                         ▼
┌────────────────────────────────────────────────────────┐
│ For each cluster, check each directory:                 │
│   Does cwd start with expanded directory path?         │
│                                                        │
│ Collect all matches, pick longest prefix (most specific)│
│ → If match: assign to that cluster (done)              │
└────────────────────────┬───────────────────────────────┘
                         │ no match
                         ▼
┌────────────────────────────────────────────────────────┐
│ Assign to "Unclustered" (implicit, always exists)      │
└────────────────────────────────────────────────────────┘
```

### Server Implementation

```typescript
// server/src/cluster-assignment.ts

interface AssignmentResult {
  clusterId: string | null;  // null = unclustered
  reason: "manual" | "directory" | "none";
}

function assignSessionToCluster(
  sessionId: string,
  cwd: string,
  config: ClusterConfig,
): AssignmentResult {
  // 1. Check manual override
  const manualCluster = config.manualAssignments[sessionId];
  if (manualCluster && config.clusters.some(c => c.id === manualCluster)) {
    return { clusterId: manualCluster, reason: "manual" };
  }

  // 2. Directory prefix matching (longest wins)
  let bestMatch: { clusterId: string; length: number } | null = null;
  const expandedCwd = expandTilde(cwd);

  for (const cluster of config.clusters) {
    for (const dir of cluster.directories) {
      const expandedDir = expandTilde(dir);
      if (expandedCwd.startsWith(expandedDir)) {
        if (!bestMatch || expandedDir.length > bestMatch.length) {
          bestMatch = { clusterId: cluster.id, length: expandedDir.length };
        }
      }
    }
  }

  if (bestMatch) {
    return { clusterId: bestMatch.clusterId, reason: "directory" };
  }

  // 3. No match
  return { clusterId: null, reason: "none" };
}
```

## Server: Cluster Store

```typescript
// server/src/cluster-store.ts

interface ClusterStoreDeps {
  configPath: string;
  onChange: () => void;  // Triggers SSE broadcast
}

function createClusterStore(deps: ClusterStoreDeps) {
  let config: ClusterConfig = loadOrDefault(deps.configPath);

  return {
    getConfig(): ClusterConfig;
    getClusters(): ClusterDefinition[];

    createCluster(name: string, directories?: string[]): ClusterDefinition;
    updateCluster(id: string, updates: Partial<Pick<ClusterDefinition, "name" | "directories">>): void;
    deleteCluster(id: string): void;
    reorderClusters(orderedIds: string[]): void;

    setManualAssignment(sessionId: string, clusterId: string | null): void;
    getManualAssignment(sessionId: string): string | null;
    clearManualAssignment(sessionId: string): void;

    /** Re-evaluate assignment for a session (called on register or cluster edit) */
    assignSession(sessionId: string, cwd: string): AssignmentResult;
  };
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/clusters` | List all clusters with current pod membership |
| POST | `/api/clusters` | Create a new cluster |
| PATCH | `/api/clusters/:id` | Update name or directories |
| DELETE | `/api/clusters/:id` | Delete a cluster |
| POST | `/api/clusters/reorder` | Update sort order |
| POST | `/api/clusters/assign` | Manually assign a session to a cluster |

### Request/Response Schemas

```typescript
// POST /api/clusters
interface CreateClusterBody {
  name: string;
  directories?: string[];
}

// PATCH /api/clusters/:id
interface UpdateClusterBody {
  name?: string;
  directories?: string[];
}

// POST /api/clusters/reorder
interface ReorderClustersBody {
  orderedIds: string[];  // Cluster IDs in desired order
}

// POST /api/clusters/assign
interface AssignBody {
  sessionId: string;
  clusterId: string | null;  // null = remove manual assignment
}
```

## Drag-and-Drop UX

Using `@dnd-kit` with sortable preset:

### Interactions

| Action | Behavior |
|--------|----------|
| Drag pod row in sidebar | Ghost element follows cursor; valid drop zones highlight |
| Drop pod on cluster section | Manual assignment created; pod moves to target cluster |
| Drop pod on "Unclustered" | Manual assignment cleared; reverts to directory-based matching |
| Drag cluster in sidebar | Reorder clusters; "Unclustered" is not a valid drop target |

### Implementation Approach

```typescript
// client/src/components/dnd/DndContext.tsx

import { DndContext, closestCenter, DragOverlay } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

// Two DnD contexts:
// 1. Cluster reordering (sortable within sidebar)
// 2. Pod assignment (draggable pods → droppable cluster zones)

// Sensors: pointer + keyboard (accessibility)
// Collision detection: closestCenter for cluster reorder, custom for pod assignment
```

### Drop Zone Feedback

```
┌─────────────────────────┐
│ 🟢 Work          [3]   │  ← drop zone (highlighted on hover)
│   ├─ project-a          │
│   ├─ project-b          │
│   └─ [dragging here...] │  ← insertion indicator
├─────────────────────────┤
│ 🟡 Personal      [1]   │  ← drop zone
│   └─ pi-fleet           │
├─────────────────────────┤
│ ── Unclustered ──       │  ← drop zone (always valid)
│   └─ random-session     │
└─────────────────────────┘
```

## SSE Events for Clusters

```typescript
type ClusterSSEEvent =
  | { type: "cluster:created"; cluster: ClusterDefinition }
  | { type: "cluster:updated"; cluster: ClusterDefinition }
  | { type: "cluster:deleted"; clusterId: string }
  | { type: "cluster:reordered"; orderedIds: string[] }
  | { type: "cluster:assignment-changed"; sessionId: string; clusterId: string | null };
```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Session's cwd matches multiple clusters equally | First cluster by sortOrder wins (deterministic) |
| Cluster deleted while pods are assigned | Pods revert to directory matching or "Unclustered" |
| Manual assignment to a cluster that was deleted | Assignment cleared on next load (orphan cleanup) |
| Session resumes with same sessionId | Manual assignment persists (keyed by sessionId) |
| Tilde in directory doesn't expand | Always expand `~` to `os.homedir()` before comparison |
| Trailing slash inconsistency | Normalize: always add trailing slash before prefix comparison |
