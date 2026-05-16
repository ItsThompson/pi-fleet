# 01: Project Overview

## Feature Name

**Pi Fleet**: a macOS menu-bar dashboard for observing, grouping, and navigating pi coding agent sessions.

## Summary

Pi Fleet is a new project (located at `~/Documents/pi-fleet/`, brand new git history) that provides a rich dashboard for monitoring all active pi coding sessions on the machine. It introduces hierarchical organization (Pods and Clusters), an attention system for sessions needing user input, and a reliable terminal-opener for one-click navigation to any session's tmux pane.

## Background

**pi-watch** (at `~/Documents/pi-watch/`) is an existing Electron menu-bar app that shows a flat list of active pi sessions with colored status dots. It works but has significant limitations:

- **Flat list**: no grouping by parent/child relationship or project context. When running 5+ sessions (especially with subagents), the list is unmanageable.
- **Terminal opener is broken**: after `tmux switch-client`, nothing activates the terminal window. The `list-clients` command is unscoped (counts all tmux clients, not just the target session's), making it fail with multiple terminal windows.
- **No organizational structure**: no way to group sessions by project, directory, or user-defined categories.
- **No attention signaling**: no way to quickly see which sessions need user input without scanning every row.
- **Limited session data**: only shows name and activity status dot. No model, context usage, or turn count.

## Vision

After this epic is complete:

1. Users see their sessions organized into Pods (parent + subagent groups) and Clusters (user-defined project groupings).
2. Clicking any session reliably switches tmux AND brings the terminal window to the foreground.
3. Badge counts and filters instantly surface which sessions need attention across all clusters.
4. Session cards show rich metadata: model name, context usage, turn count, thinking level.
5. The sidebar + card-grid navigation pattern (inspired by Slack) provides fast drill-down without losing overview context.

## Goals

| Goal                              | Success Metric                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| Reliable terminal switching       | Click-to-switch works with window activation in 100% of single-client tmux setups              |
| Hierarchical session organization | Parent/child relationships auto-detected; subagents nest under their parent                    |
| Project-based grouping            | Sessions auto-assign to clusters by directory prefix; manual override persists across restarts |
| Attention visibility              | User can identify all sessions needing input within 1 second of looking at the app             |
| Rich session metadata             | Each session card shows model, context %, status, turn count                                   |
| Graceful degradation              | App works fully even without subagent-orchestrator installed (pods just have one member)       |

## Stakeholders

| Stakeholder              | Interest                                                                          |
| ------------------------ | --------------------------------------------------------------------------------- |
| Pi power users (primary) | Run multiple concurrent pi sessions, need fast navigation and status awareness    |
| Subagent orchestrators   | Spawn child agents and need to see which are blocked or idle                      |
| Solo pi users            | Benefit from terminal opener fixes and attention badges even with single sessions |

## Glossary

| Term                      | Definition                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pod**                   | A session plus all subagents it owns. Every session is always in a pod. A standalone session is a single-member pod. Derived/computed, never explicitly created or destroyed. |
| **Cluster**               | A named, persistent section that groups pods. Optionally bound to one or more directories. Survives app restarts even when empty. User-created and user-deletable.            |
| **Attention**             | A session state indicating user input is needed: either `pending_approval` (tool permission blocked) or `idle` (agent finished, waiting for next prompt).                     |
| **Lead session**          | The parent session in a multi-member pod. Determines pod display name.                                                                                                        |
| **Ghost Mode**            | Overlay becomes translucent and click-through, allowing interaction with windows beneath.                                                                                     |
| **pi.events**             | Pi's shared in-process event bus for inter-extension communication.                                                                                                           |
| **subagent-orchestrator** | Existing pi extension that manages spawning and communication with child agent processes.                                                                                     |

## Project Origin

This is a **new project**, not a modification of pi-watch. The codebase will be initialized at `~/Documents/pi-fleet/` with a brand new git history. The initial commit will be a fork of pi-watch's source with references renamed from `pi-watch` to `pi-fleet`, unnecessary components stripped, and the UI rebuilt using shadcn + zustand. Pi-watch remains as-is at `~/Documents/pi-watch/` as a reference implementation.
