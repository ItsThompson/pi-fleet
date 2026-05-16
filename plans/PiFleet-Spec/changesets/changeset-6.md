# Changeset 6: Pod System

**Ticket:** [06-pod-system.md](../tickets/06-pod-system.md)
**Date:** 2026-05-15
**Status:** Complete

## Summary

Implemented the pod computation system on the server and the inter-extension ownership protocol in the pi-fleet extension. Pods are computed groupings of a parent session and its subagent children, formed from session registration and ownership reports.

## Changes by Package

### @pi-fleet/server

| File | Action | Purpose |
|------|--------|---------|
| `src/pod-registry.ts` | Created | PodRegistry: computes pods from sessions + ownership, emits lifecycle events |
| `src/pod-registry.test.ts` | Created | 20 unit tests: single-member pods, ownership, parent/child death, state aggregation, attention |
| `src/routes/pods.ts` | Created | GET /api/pods and POST /api/pods/ownership route handlers |
| `src/pod-routes.test.ts` | Created | 7 integration tests for pod endpoints via Fastify inject |
| `src/server.ts` | Modified | Added PodRegistry wiring, pod event bridge, re-evaluation on register/remove |
| `src/schemas.ts` | Modified | Added ownershipBodySchema (parentSessionId + subagentIds[]) |
| `src/routes/health.ts` | Modified | Accepts PodRegistry, returns real pod count |
| `src/index.ts` | Modified | Added PodRegistry and ownershipBodySchema to barrel exports |

### @pi-fleet/extension

| File | Action | Purpose |
|------|--------|---------|
| `src/pod-reporter.ts` | Created | Inter-extension signal/request/response protocol for ownership reporting |
| `src/pod-reporter.test.ts` | Created | 7 unit tests: protocol flow, catch-up, graceful degradation, malformed payloads |
| `src/index.ts` | Modified | Integrated PodReporter initialization and catch-up on session_start |

### subagent-orchestrator (external)

| File | Action | Purpose |
|------|--------|---------|
| `index.ts` | Modified | Added `pi-fleet:request-subagent-registry` response handler (~5 lines) |
| `wire-broker-callbacks.ts` | Modified | Emit `subagent-orchestrator:registry-updated` on register/disconnect |

## API Surface Added

```
GET  /api/pods            → { pods: Pod[] }
POST /api/pods/ownership  → { ok: true, matchedIds: string[], unmatchedIds: string[] }
```

## SSE Events Added

```
pod:formed    → Pod        (ownership groups sessions)
pod:updated   → Pod        (member added/removed, state changed)
pod:dissolved → { leadSessionId: string }  (all members removed)
```

## Test Coverage

- Server: 91 tests (27 new for pod system)
- Extension: 85 tests (7 new for PodReporter)
- All existing tests continue to pass (no regressions)
- `tsc --noEmit` passes in both packages

## Inter-Extension Protocol

```
subagent-orchestrator          pi.events          pi-fleet extension
        │                         │                       │
        ├──emit("registry-updated")──────────────────────►│
        │                         │                       │
        │◄───emit("request-subagent-registry")────────────┤
        │                         │                       │
        ├──emit("registry-response", {subagentIds})──────►│
        │                         │                       │
        │                         │    POST /api/pods/ownership
```
