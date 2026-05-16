# Pi Fleet

A macOS menu-bar dashboard for observing, grouping, and navigating pi coding agent sessions. Pi Fleet shows all active sessions on your machine, organizes them hierarchically, surfaces which sessions need your attention, and lets you jump to any session's terminal pane with one click.

Pi Fleet is **observation-only**: all agent interaction stays in the terminal.

## Features

- **Pods**: sessions automatically group by parent/child relationship. A parent session and its subagents form a pod with aggregated status.
- **Clusters**: user-created project groupings bound to directories. Sessions auto-assign by working directory; drag-and-drop for manual override.
- **Attention system**: badge counts, state filters, and a notification panel instantly surface sessions that need input (`idle` or `pending_approval`).
- **Terminal opener**: click any session to switch tmux and bring the terminal window to the foreground. Validates pane existence, scopes to the correct client, and activates the terminal app via osascript.
- **Rich metadata**: each session card shows model name, context usage %, turn count, thinking level, and current tool.
- **Ghost mode**: overlay becomes translucent and click-through so you can keep it visible while working.
- **Sound alerts**: optional audio notification when sessions transition to attention states.

## Architecture

Pi Fleet is a Turborepo monorepo with five packages:

| Package | Role |
|---------|------|
| `@pi-fleet/shared` | Type definitions, constants, path utilities shared across all packages |
| `@pi-fleet/server` | Fastify HTTP server + SSE: session registry, pod computation, cluster management |
| `@pi-fleet/client` | React UI (shadcn/ui + Tailwind + zustand): sidebar, card grids, drag-and-drop |
| `@pi-fleet/desktop` | Electron main process: window management, tray, global shortcuts, terminal opener |
| `@pi-fleet/extension` | Pi extension installed per-user: registers sessions, sends heartbeats, reports pod ownership |

The Electron app embeds the Fastify server (localhost:8314) and loads the React client via `@fastify/static`. Each pi session runs the extension, which POSTs registration and heartbeats to the server. The client subscribes to SSE for real-time updates.

## Prerequisites

- macOS (Electron menu-bar app pattern)
- Node.js 20+
- npm 10+
- tmux (for terminal opener functionality)
- pi coding agent installed

## Setup

```bash
cd ~/Documents/pi-fleet
npm install
```

## Development

Run all packages in watch mode:

```bash
npm run dev
```

This starts the Fastify server (with hot-reload via tsx) and the Vite dev server for the client. The desktop package must be started separately for Electron:

```bash
npm run dev --prefix desktop
```

## Build

Build all packages:

```bash
npm run build
```

## Run the App

Build and launch the Electron app:

```bash
npm run app
```

This builds all packages, then starts Electron with the embedded server and client.

## Distribution

Releases are automated via GitHub Actions. To cut a new release:

```bash
npm run patch   # patch bump (0.1.0 → 0.1.1)
npm run minor   # minor bump (0.1.0 → 0.2.0)
npm run major   # major bump (0.1.0 → 1.0.0)
```

This bumps versions across all workspaces, commits, tags, and pushes. The CD workflow then builds the macOS arm64 DMG and publishes a GitHub release with auto-generated notes.

To build a local DMG without releasing:

```bash
npm run dist
```

Output lands in `desktop/dist/`. Builds are currently unsigned (`identity: null`).

## Install the Pi Extension

The extension must be installed so pi sessions register with the fleet server.

Symlink the extension into your pi extensions directory:

```bash
ln -s ~/Documents/pi-fleet/extension ~/.pi/agent/extensions/pi-fleet
```

Pi will auto-discover it on next session start. The extension:
1. Registers the session on `session_start`
2. Sends heartbeats every 5 seconds with activity state and metadata
3. Reports subagent ownership via the inter-extension protocol (if `subagent-orchestrator` is installed)
4. Unregisters on `session_shutdown`

## Testing

Run all tests across the monorepo:

```bash
npm test
```

Run tests for a single package:

```bash
npm test --prefix server
npm test --prefix extension
npm test --prefix client
npm test --prefix desktop
```

All packages use Vitest. The client additionally uses Testing Library for component tests.

## Configuration

Pi Fleet stores its config at:

- **App config**: `~/Library/Application Support/PiFleet/config.json` (clusters, manual assignments, preferences)
- **Logs**: `~/Library/Logs/PiFleet/pi-fleet.log`

## Key Bindings

| Key | Action |
|-----|--------|
| F5 | Toggle overlay visibility |

Additional controls are available in the system tray menu (ghost mode, sound, quit).

## Inter-Extension Protocol

Pi Fleet discovers subagent relationships through a signal/request/response protocol on `pi.events`:

1. `subagent-orchestrator` emits `registry-updated` when subagents change
2. Pi Fleet extension requests the current registry
3. Orchestrator responds with subagent IDs
4. Extension posts ownership to the server, forming pods

If `subagent-orchestrator` is not installed, all sessions render as standalone pods. No errors, no degraded UX: just flat.

## Server API

The embedded Fastify server exposes these endpoints (localhost only, no auth):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/sessions/register` | Register a new session |
| POST | `/api/sessions/heartbeat` | Update session state |
| POST | `/api/sessions/unregister` | Remove a session |
| GET | `/api/sessions` | List all registered sessions |
| GET | `/api/pods` | List all computed pods |
| POST | `/api/pods/ownership` | Report subagent ownership |
| GET | `/api/events` | SSE stream for real-time updates |
| POST | `/api/open-terminal` | Resolve session to tmux target |
| GET | `/api/clusters` | List clusters with membership |
| POST | `/api/clusters` | Create a cluster |
| PATCH | `/api/clusters/:id` | Update a cluster |
| DELETE | `/api/clusters/:id` | Delete a cluster |
| POST | `/api/clusters/reorder` | Update cluster sort order |
| POST | `/api/clusters/assign` | Manual pod-to-cluster assignment |
| GET | `/api/health` | Server health check |
