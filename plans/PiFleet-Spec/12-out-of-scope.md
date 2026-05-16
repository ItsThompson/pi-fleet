# 12: Out of Scope

## Explicitly Deferred

| Feature                                    | Reason for Deferral                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Workflow visualization (React Flow graphs) | Massive complexity; visual graph rendering is an epic unto itself; session monitoring doesn't require it                 |
| Git worktree integration                   | Would add directory inference intelligence but couples to git internals; cluster directories are sufficient for grouping |
| Web-based chat/interaction with agents     | All agent interaction remains in the terminal; pi-fleet is observation-only                                              |
| App renaming from pi-fleet                 | Name is decided; no further naming iterations in this epic                                                               |
| Peek/preview of session output             | Would require streaming terminal content or session file parsing; terminal switch is sufficient                          |
| Real-time collaboration                    | CRDTs, multi-user state: massive complexity for a single-user tool                                                       |
| Parallel execution orchestration           | Pi-fleet observes, doesn't orchestrate; subagent-orchestrator handles spawning                                           |
| Mobile/remote access                       | Localhost-only architecture; remote access would require auth, networking, security audit                                |
| Plugin system for pi-fleet                 | No extension points in the dashboard itself; unnecessary for a single-purpose tool                                       |
| Session log viewer                         | Parsing JSONL session files for display; out of scope, terminal access suffices                                          |
| Custom sound selection                     | Sound plays on attention transitions; custom sound file selection is a nice-to-have, not P0                              |
| Cluster sharing/export                     | Clusters are local config; sharing between machines is a future concern                                                  |
| Automatic cluster creation from git repos  | Would scan filesystem for repos; too magical, explicit creation is clear                                                 |
| Keyboard navigation within the overlay     | Tab/arrow navigation of cards/sidebar; accessibility improvement for future                                              |
| Multi-monitor awareness                    | Overlay always appears on primary display; multi-monitor placement is future work                                        |
| Session metrics/analytics                  | Historical data (session duration, tool usage over time); would require persistent storage beyond config.json            |
| Dark/light theme toggle                    | shadcn supports it, but single dark theme is sufficient for V1 (menu-bar overlays are traditionally dark)                |

## Boundary Clarifications

| Boundary                            | In Scope                                                                    | Out of Scope                                                |
| ----------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| subagent-orchestrator modifications | Adding the `pi-fleet:request-subagent-registry` listener (response handler) | Any other changes to orchestrator behavior, protocol, or UI |
| Cluster persistence                 | JSON file in Application Support                                            | Database, cloud sync, encryption                            |
| Terminal opener                     | Switch + activate terminal                                                  | Opening new terminal windows, creating new tmux sessions    |
| Extension data collection           | Model, context %, turns, thinking level, last tool                          | Full message history, token costs, session file content     |
| Drag-and-drop                       | Pod ↔ cluster reassignment, cluster reorder                                 | Reorder pods within a cluster, drag sessions out of pods    |
| Sound alerts                        | Single notification sound on attention transitions                          | Per-state sounds, volume control, custom sounds             |
| Window management                   | Menu-bar overlay with ghost mode                                            | Detachable panels, multiple windows, docking                |
