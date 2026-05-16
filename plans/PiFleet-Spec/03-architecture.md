# 03: Architecture

## Directory Structure

```
~/Documents/pi-fleet/
├── package.json                    # Monorepo root (npm workspaces + turbo)
├── turbo.json                      # Turborepo build config
├── tsconfig.base.json              # Shared TS config
├── eslint.config.mjs               # Shared lint config
├── shared/                         # @pi-fleet/shared: types, constants, paths
│   ├── package.json
│   ├── src/
│   │   ├── index.ts                # Public exports
│   │   ├── constants.ts            # Server port, timing constants
│   │   ├── paths.ts                # Config/log path resolution
│   │   └── types/
│   │       ├── session.ts          # ActivityStatus, RegisteredSession, HeartbeatPayload, SSEEvent
│   │       ├── pod.ts              # Pod, PodState types
│   │       ├── cluster.ts          # Cluster, ClusterConfig persistence types
│   │       └── config.ts           # PiFleetConfig (app-level config)
│   └── tsconfig.json
├── server/                         # @pi-fleet/server: Fastify API + SSE
│   ├── package.json
│   ├── src/
│   │   ├── server.ts               # Server factory, route registration
│   │   ├── session-registry.ts     # In-memory session store + change events
│   │   ├── pod-registry.ts         # Pod computation from sessions + ownership reports
│   │   ├── cluster-store.ts        # Cluster persistence (read/write config.json)
│   │   ├── cluster-assignment.ts   # Directory matching + manual override logic
│   │   ├── event-bus.ts            # SSE event distribution
│   │   ├── schemas.ts              # Zod validation schemas
│   │   ├── routes/
│   │   │   ├── sessions.ts         # Registration, heartbeat, unregister
│   │   │   ├── events.ts           # SSE stream endpoint
│   │   │   ├── open-terminal.ts    # Resolve session → tmux target
│   │   │   ├── pods.ts             # Pod listing, ownership report endpoint
│   │   │   ├── clusters.ts         # CRUD for clusters
│   │   │   └── health.ts           # Health check
│   │   └── utils/
│   │       └── logger.ts           # Structured JSON logging
│   └── tsconfig.json
├── client/                         # @pi-fleet/client: React + shadcn + zustand
│   ├── package.json
│   ├── src/
│   │   ├── main.tsx                # React entry
│   │   ├── App.tsx                 # Root layout: sidebar + main area
│   │   ├── stores/
│   │   │   ├── session-store.ts    # Zustand: sessions, SSE subscription
│   │   │   ├── pod-store.ts        # Zustand: computed pods from sessions + ownership
│   │   │   ├── cluster-store.ts    # Zustand: cluster CRUD, assignment state
│   │   │   ├── navigation-store.ts # Zustand: current view (cluster, pod, notifications)
│   │   │   └── filter-store.ts     # Zustand: active state filters
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx          # Cluster list + pod rows
│   │   │   │   ├── MainArea.tsx         # Route-based card grid or notification panel
│   │   │   │   └── Header.tsx           # App header: title, notification bell, global actions
│   │   │   ├── clusters/
│   │   │   │   ├── ClusterSection.tsx   # Collapsible cluster in sidebar
│   │   │   │   ├── ClusterView.tsx      # Card grid for a cluster's pods
│   │   │   │   ├── ClusterHeader.tsx    # Cluster detail header (dirs, manual count)
│   │   │   │   └── ClusterForm.tsx      # Create/edit cluster dialog
│   │   │   ├── pods/
│   │   │   │   ├── PodCard.tsx          # Pod card in cluster grid view
│   │   │   │   ├── PodRow.tsx           # Pod row in sidebar
│   │   │   │   ├── PodView.tsx          # Card grid for a pod's sessions
│   │   │   │   └── PodBadge.tsx         # Attention badge for pods
│   │   │   ├── sessions/
│   │   │   │   ├── SessionCard.tsx      # Rich session card (model, context%, turns)
│   │   │   │   └── SessionStatusDot.tsx # Colored activity indicator
│   │   │   ├── attention/
│   │   │   │   ├── AttentionBadge.tsx   # Badge count component
│   │   │   │   ├── FilterBadges.tsx     # Clickable state filter badges
│   │   │   │   └── NotificationPanel.tsx# Global attention list
│   │   │   └── dnd/
│   │   │       ├── DndContext.tsx       # @dnd-kit provider + sensors
│   │   │       ├── DraggablePod.tsx     # Draggable wrapper for pod rows
│   │   │       └── DroppableCluster.tsx # Drop zone for cluster sections
│   │   ├── hooks/
│   │   │   ├── useSSE.ts               # SSE connection + reconnection
│   │   │   └── useTerminalOpener.ts    # IPC call to open session
│   │   └── lib/
│   │       └── utils.ts                # shadcn cn() utility
│   ├── components.json                  # shadcn config
│   ├── tailwind.config.ts
│   └── tsconfig.json
├── desktop/                        # @pi-fleet/desktop: Electron main process
│   ├── package.json
│   ├── src/
│   │   ├── main.ts                 # App lifecycle, IPC handlers, shortcuts
│   │   ├── preload.ts              # Context bridge (piFleet.*)
│   │   ├── server.ts              # Embedded server start/stop
│   │   ├── window.ts              # BrowserWindow management, ghost mode
│   │   ├── tray.ts                # System tray menu
│   │   ├── config.ts              # Load/save app config
│   │   ├── terminal-opener.ts     # tmux switch + window activation
│   │   └── utils/
│   │       └── logger.ts
│   ├── assets/                    # App icon, tray icon
│   └── tsconfig.json
├── extension/                      # pi-fleet extension (installed into ~/.pi/agent/extensions/)
│   ├── package.json
│   ├── src/
│   │   ├── index.ts               # Extension entry: lifecycle hooks, event bus wiring
│   │   ├── heartbeat-client.ts    # HTTP client: register, heartbeat, unregister
│   │   ├── activity-tracker.ts    # State machine: idle/processing/running_tool/pending_approval
│   │   ├── tmux-target.ts         # Capture tmux session:window.pane
│   │   ├── session-data.ts        # Collect model, context%, turns, thinking level
│   │   └── pod-reporter.ts        # Inter-extension protocol: signal/request/response
│   └── tsconfig.json
└── e2e/                            # End-to-end tests
    ├── package.json
    └── src/
```

## Dependency Map

```
+------------------+       +------------------+       +------------------+
|  @pi-fleet/      |       |  @pi-fleet/      |       |  @pi-fleet/      |
|  shared          |<------+  server           |       |  client          |
|  (types, consts) |       |  (Fastify API)   |       |  (React UI)      |
+--------+---------+       +--------+---------+       +--------+---------+
         ^                          ^                          |
         |                          |                          | HTTP/SSE
         |                 +--------+---------+                |
         +-----------------+  @pi-fleet/      +<---------------+
                           |  desktop         |
                           |  (Electron main) |
                           +------------------+

+------------------+       +---------------------------+
|  @pi-fleet/      |       | subagent-orchestrator     |
|  extension       +------>| (existing, unmodified)    |
|  (pi extension)  | events| ~/.pi/agent/extensions/   |
+------------------+       +---------------------------+
```

**Existing dependencies (from pi-watch, carried forward):**

- Electron (app shell, tray, global shortcuts)
- Fastify + @fastify/static (HTTP server)
- Zod (payload validation)
- Turborepo (monorepo build orchestration)

**New dependencies:**

- shadcn/ui (component library, built on Radix + Tailwind)
- zustand (client state management)
- @dnd-kit/core + @dnd-kit/sortable (drag-and-drop)
- Tailwind CSS (styling, required by shadcn)

**Removed from pi-watch:**

- SWR (replaced by zustand with SSE subscription)

## High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        Electron Main Process                      │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ BrowserWindow│  │  Tray Menu   │  │  Terminal Opener       │  │
│  │ (Overlay)    │  │  Ghost/Sound │  │  tmux + osascript      │  │
│  └──────┬───────┘  └──────────────┘  └───────────────────────┘  │
│         │ loads                                                   │
│  ┌──────┴──────────────────────────────────────────────────────┐ │
│  │              Fastify Server (127.0.0.1:8314)                 │ │
│  │                                                              │ │
│  │  SessionRegistry ←→ PodRegistry ←→ ClusterStore             │ │
│  │       │                   │              │                   │ │
│  │       └──── EventBus ─────┴──────────────┘                  │ │
│  │              (SSE broadcast)                                  │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
           ▲                              ▲
           │ HTTP POST                    │ SSE stream
           │ (register/heartbeat)         │ (real-time updates)
           │                              │
┌──────────┴───┐                ┌─────────┴──────────┐
│  pi-fleet    │                │  React Client      │
│  extension   │                │  (shadcn + zustand) │
│  (per pi     │                │                    │
│   session)   │                │  Sidebar → Grids   │
└──────────────┘                └────────────────────┘
```

## Component Roles

| Component                       | Responsibility                                        | Module Type       |
| ------------------------------- | ----------------------------------------------------- | ----------------- |
| `shared/types/`                 | Type definitions shared across all packages           | Thin (types only) |
| `server/session-registry`       | In-memory session store, change event emission        | Deep module       |
| `server/pod-registry`           | Compute pods from sessions + ownership reports        | Deep module       |
| `server/cluster-store`          | Read/write cluster config, assignment logic           | Deep module       |
| `server/event-bus`              | Fan-out SSE events to connected clients               | Thin adapter      |
| `server/routes/*`               | HTTP endpoint handlers, validation                    | Thin adapters     |
| `desktop/terminal-opener`       | tmux switch + window activation orchestration         | Deep module       |
| `desktop/window`                | BrowserWindow lifecycle, ghost mode, resize           | Adapter           |
| `client/stores/*`               | Zustand state: sessions, pods, clusters, filters, nav | Deep modules      |
| `client/components/dnd/*`       | @dnd-kit integration: sensors, drag/drop wiring       | Adapter           |
| `client/components/clusters/*`  | Cluster UI: sidebar sections, card grids, forms       | UI components     |
| `client/components/pods/*`      | Pod UI: cards, rows, detail views                     | UI components     |
| `client/components/sessions/*`  | Session UI: rich cards, status indicators             | UI components     |
| `client/components/attention/*` | Attention UI: badges, filters, notification list      | UI components     |
| `extension/index`               | Lifecycle hooks, inter-extension protocol wiring      | Orchestrator      |
| `extension/session-data`        | Collect model/context/turns from pi API               | Deep module       |
| `extension/pod-reporter`        | Signal/request/response protocol for ownership        | Deep module       |

## Data Flow: Session Registration (Happy Path)

```
Pi session starts
       │
       ▼
┌──────────────────┐
│ pi-fleet ext:    │
│ session_start    │
│ hook fires       │
└────────┬─────────┘
         │  POST /api/sessions/register
         │  { sessionId, pid, cwd, tmuxTarget, startTime, agentName,
         │    subagentId?, model?, contextUsage?, turnCount? }
         ▼
┌──────────────────┐
│ Server:          │
│ SessionRegistry  │───► EventBus.emit("session:added", session)
│ .register()      │            │
└────────┬─────────┘            │
         │                      ▼
         │              ┌──────────────────┐
         │              │ SSE stream       │
         │              │ → React client   │
         │              └────────┬─────────┘
         ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│ PodRegistry:     │    │ Client:          │
│ evaluate pod     │    │ sessionStore     │
│ membership       │    │ .addSession()    │
└────────┬─────────┘    └────────┬─────────┘
         │                       │
         ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│ ClusterAssign:   │    │ Client:          │
│ match cwd →      │    │ podStore         │
│ cluster          │    │ recompute pods   │
└──────────────────┘    └──────────────────┘
```

## Data Flow: Pod Formation (Inter-Extension Protocol)

```
subagent-orchestrator spawns a child
       │
       ▼
┌────────────────────────────────────────┐
│ subagent-orchestrator: broker.onRegister│
│ emit("subagent-orchestrator:           │
│       registry-updated")               │
└────────────────────┬───────────────────┘
                     │ pi.events (in-process)
                     ▼
┌────────────────────────────────────────┐
│ pi-fleet extension: hears signal       │
│ emit("pi-fleet:request-subagent-       │
│       registry")                       │
└────────────────────┬───────────────────┘
                     │ pi.events
                     ▼
┌────────────────────────────────────────┐
│ subagent-orchestrator: hears request   │
│ emit("subagent-orchestrator:           │
│       registry-response",              │
│       { subagentIds: [...] })          │
└────────────────────┬───────────────────┘
                     │ pi.events
                     ▼
┌────────────────────────────────────────┐
│ pi-fleet extension: hears response     │
│ POST /api/pods/ownership               │
│ { parentSessionId, subagentIds: [...] }│
└────────────────────┬───────────────────┘
                     │ HTTP
                     ▼
┌────────────────────────────────────────┐
│ Server: PodRegistry                    │
│ - Match subagentIds to registered      │
│   sessions (via subagentId field)      │
│ - Group into pod under parent          │
│ - Emit "pod:updated" via EventBus      │
└────────────────────────────────────────┘
```

## Key Architectural Decisions

| Decision                               | Rationale                                                                                    | Alternatives Considered                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Fork pi-watch as starting point        | Proven Electron + Fastify + extension architecture; saves weeks of boilerplate               | Build from scratch (too slow), modify pi-watch in-place (risk breaking existing users)            |
| shadcn + Tailwind for UI               | Consistent design system, accessible primitives, composable components                       | Keep custom CSS (pi-watch style: inline styles, no component lib)                                 |
| zustand for state                      | Minimal boilerplate, supports SSE subscription patterns, no provider nesting                 | SWR (current pi-watch: too limited for complex state), Redux (too heavy)                          |
| @dnd-kit for drag-and-drop             | Best React DnD lib for accessibility + performance, native shadcn integration, kanban-proven | react-beautiful-dnd (deprecated), HTML5 drag API (poor UX), pragmatic-drag-and-drop (less mature) |
| Pod computation on server              | Single source of truth: all clients see same pod structure, no client-side drift             | Client-side computation (each client computes differently, stale data risk)                       |
| Inter-extension protocol via pi.events | Zero coupling: subagent-orchestrator is unmodified, pi-fleet depends on it one-way           | Direct import (tight coupling), file-based (latency), shared DB (overkill)                        |
| Signal/request/response pattern        | Subagent-orchestrator never knows about pi-fleet; pi-fleet initiates all data requests       | Direct event payload (would require modifying subagent-orchestrator)                              |
| Cluster config in Application Support  | Standard macOS location for app state, survives app updates, easy to inspect/edit            | SQLite (overkill), plist (harder to edit), dotfile (clutters home)                                |
| Embedded Fastify server                | Extensions POST directly to localhost; no IPC complexity for multi-session coordination      | Electron IPC only (can't receive from extensions in other processes)                              |
| Bigger window, same menu-bar pattern   | Users want a dashboard they can summon/dismiss instantly, not a full desktop app             | Full windowed app (loses quick-access UX), keep tiny overlay (insufficient space for card grids)  |
