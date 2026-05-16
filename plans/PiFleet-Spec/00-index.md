# Pi Fleet: Feature Specification

## Section Map

| #   | File                                                               | Description                                                                            |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 01  | [01-project-overview.md](./01-project-overview.md)                 | Background, vision, goals, stakeholders, glossary                                      |
| 02  | [02-user-stories.md](./02-user-stories.md)                         | Persona, stories by feature area, acceptance criteria                                  |
| 03  | [03-architecture.md](./03-architecture.md)                         | Directory tree, dependency map, component roles, data flow                             |
| 04  | [04-terminal-opener.md](./04-terminal-opener.md)                   | Terminal opener fixes: window activation, scoped clients, validation                   |
| 05  | [05-pod-system.md](./05-pod-system.md)                             | Inter-extension protocol, pod lifecycle, state aggregation                             |
| 06  | [06-cluster-system.md](./06-cluster-system.md)                     | Persistence format, directory binding, drag-and-drop                                   |
| 07  | [07-attention-system.md](./07-attention-system.md)                 | Badges, filters, notification panel                                                    |
| 08  | [08-session-data-model.md](./08-session-data-model.md)             | ActivityStatus enum, state machine, registration/heartbeat payloads, config versioning |
| 09  | [09-communication-interfaces.md](./09-communication-interfaces.md) | HTTP API catalog, Electron IPC channels, SSE event types                               |
| 10  | [10-nonfunctional.md](./10-nonfunctional.md)                       | Window dimensions, performance, security, error handling, observability                |
| 11  | [11-testing-strategy.md](./11-testing-strategy.md)                 | Test philosophy, layers, key targets, smoke tests                                      |
| 12  | [12-out-of-scope.md](./12-out-of-scope.md)                         | Explicit deferrals with rationale                                                      |

## Version History

| Version | Date       | Author   | Changes                                                                                                                                                                                                               |
| ------- | ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2025-05-15 | thompsnt | Initial spec                                                                                                                                                                                                          |
| 1.1     | 2025-05-15 | thompsnt | Added: communication interfaces catalog (09), ActivityStatus enum + state machine (08), window dimensions (10), config versioning (08), setup/resilience user stories (02). Fixed: IPC channel prefix pw: → pf: (04). |
