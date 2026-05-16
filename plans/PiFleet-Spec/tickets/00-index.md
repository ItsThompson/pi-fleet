# Implementation Tickets

> Generated from: Pi Fleet Feature Specification (`/Users/thompsnt/Desktop/PiFleet-Spec/00-index.md`)
> Generated on: 2026-05-15
> Total tickets: 12
> Estimated phases: 5

## Dependency Graph

```
Phase 1 (parallel):
  [1] Project Scaffold + Build
  [2] Shared Types + Constants

Phase 2 (parallel, after 1+2):
  [3] Server Core: Session Registry + SSE
  [4] Extension: Activity Tracker + Heartbeat Client

Phase 3 (parallel, after 3):
  [5] Terminal Opener (Desktop)
  [6] Pod System (Server + Extension)
  [7] Client Shell: Sidebar + Session Cards + SSE Hook

Phase 4 (parallel, after 6+7):
  [8] Cluster System (Server + Client)
  [9] Attention System (Badges + Filters + Notifications)

Phase 5 (parallel, after 5+8+9):
  [10] Drag-and-Drop (Pod Reassignment + Cluster Reorder)
  [11] Desktop Chrome: Overlay, Ghost Mode, Tray, Sound
  [12] E2E Smoke Tests + Polish
```

## Summary

| # | Title | Type | Blocked By | Status |
|---|-------|------|------------|--------|
| 1 | Project Scaffold + Build | AFK | — | ⬜ |
| 2 | Shared Types + Constants | AFK | — | ⬜ |
| 3 | Server Core: Session Registry + SSE | AFK | #1, #2 | ⬜ |
| 4 | Extension: Activity Tracker + Heartbeat Client | AFK | #1, #2 | ⬜ |
| 5 | Terminal Opener | AFK | #3 | ⬜ |
| 6 | Pod System | AFK | #3 | ⬜ |
| 7 | Client Shell: Sidebar + Session Cards + SSE Hook | AFK | #3 | ⬜ |
| 8 | Cluster System | AFK | #6, #7 | ⬜ |
| 9 | Attention System | AFK | #6, #7 | ⬜ |
| 10 | Drag-and-Drop | AFK | #8 | ⬜ |
| 11 | Desktop Chrome: Overlay, Ghost Mode, Tray, Sound | AFK | #5, #8, #9 | ⬜ |
| 12 | E2E Smoke Tests + Polish | AFK | #10, #11 | ⬜ |

Status legend: ⬜ Not started · 🟡 In progress · ✅ Done
