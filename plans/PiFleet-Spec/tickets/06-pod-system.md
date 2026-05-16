### Ticket 6: Pod System

**Type:** AFK
**Blocked by:** #3
**User stories:** US-POD-01, US-POD-02, US-POD-03, US-POD-04, US-POD-05

#### What to build

Implement pod computation on the server and the inter-extension protocol in the pi-fleet extension. Server side: `PodRegistry` computes pods from sessions + ownership reports, exposes `GET /api/pods` and `POST /api/pods/ownership`, emits pod SSE events. Extension side: `PodReporter` listens for `subagent-orchestrator:registry-updated` signal, requests subagent IDs, and posts ownership to server. Also add the response handler to subagent-orchestrator (the one modification to that package).

#### Acceptance criteria

- [ ] `PodRegistry.reportOwnership(parentId, subagentIds)` groups matching sessions under parent's pod
- [ ] Sessions without ownership reports exist as single-member pods
- [ ] `GET /api/pods` returns all computed pods with `leadSessionId`, `memberSessionIds`, `displayName`, `state`, `attentionCount`
- [ ] Pod state = worst state among members (priority: `pending_approval` > `idle` > `running_tool` > `processing`)
- [ ] Pod `attentionCount` = count of members with `pending_approval` or `idle`
- [ ] Parent session removed: children become independent single-member pods; `pod:dissolved` + new `pod:formed` events emitted
- [ ] Child session removed: removed from pod, `pod:updated` emitted; pod continues if parent lives
- [ ] `POST /api/pods/ownership` returns `{ matchedIds, unmatchedIds }` for unregistered subagents
- [ ] Unmatched subagentIds are picked up when those sessions later register (re-evaluation on register)
- [ ] SSE emits `pod:formed`, `pod:updated`, `pod:dissolved` at correct lifecycle transitions
- [ ] Extension `PodReporter`: on `registry-updated` signal, emits request, on response, posts ownership
- [ ] Extension `PodReporter`: on `session_start`, emits initial request (startup catch-up)
- [ ] Graceful degradation: if subagent-orchestrator not loaded, all sessions are single-member pods (no errors)
- [ ] Unit tests for PodRegistry: all lifecycle transitions (12+ cases from spec section 05)
- [ ] Unit tests for PodReporter: signal/request/response protocol with mock event bus

#### Technical notes

- `PodRegistry` depends on `SessionRegistry` for session lookups. It maintains an `ownershipMap: Map<string, string[]>` (parentSessionId → subagentIds).
- Correlation: ownership report's `subagentIds` are matched against sessions' `subagentId` field (set from `process.env.SUBAGENT_ID`).
- subagent-orchestrator modification: add listener for `pi-fleet:request-subagent-registry` that responds with `{ subagentIds: [...broker.entries.keys()] }`. This is ~5 lines.
- Pod display name: use lead session's `agentName` or fall back to directory basename of `cwd`.

---

## Completion Summary

**Status:** ✅ Complete
**Completed:** 2026-05-15

### Acceptance Criteria

- ✅ `PodRegistry.reportOwnership(parentId, subagentIds)` groups matching sessions under parent's pod
- ✅ Sessions without ownership reports exist as single-member pods
- ✅ `GET /api/pods` returns all computed pods with `leadSessionId`, `memberSessionIds`, `displayName`, `state`, `attentionCount`
- ✅ Pod state = worst state among members (priority: `pending_approval` > `idle` > `running_tool` > `processing`)
- ✅ Pod `attentionCount` = count of members with `pending_approval` or `idle`
- ✅ Parent session removed: children become independent single-member pods; `pod:dissolved` + new `pod:formed` events emitted
- ✅ Child session removed: removed from pod, `pod:updated` emitted; pod continues if parent lives
- ✅ `POST /api/pods/ownership` returns `{ matchedIds, unmatchedIds }` for unregistered subagents
- ✅ Unmatched subagentIds are picked up when those sessions later register (re-evaluation on register)
- ✅ SSE emits `pod:formed`, `pod:updated`, `pod:dissolved` at correct lifecycle transitions
- ✅ Extension `PodReporter`: on `registry-updated` signal, emits request, on response, posts ownership
- ✅ Extension `PodReporter`: on `session_start`, emits initial request (startup catch-up)
- ✅ Graceful degradation: if subagent-orchestrator not loaded, all sessions are single-member pods (no errors)
- ✅ Unit tests for PodRegistry: all lifecycle transitions (20 test cases)
- ✅ Unit tests for PodReporter: signal/request/response protocol with mock event bus (7 test cases)

### Changes

**Files created:**
- `server/src/pod-registry.ts`: PodRegistry class with ownership map, pod computation, lifecycle event emission
- `server/src/pod-registry.test.ts`: 20 unit tests covering all lifecycle transitions
- `server/src/routes/pods.ts`: GET /api/pods and POST /api/pods/ownership route handlers
- `server/src/pod-routes.test.ts`: 7 integration tests via Fastify inject for pod endpoints
- `extension/src/pod-reporter.ts`: PodReporter factory with signal/request/response protocol
- `extension/src/pod-reporter.test.ts`: 7 unit tests for inter-extension protocol

**Files modified:**
- `server/src/server.ts`: Added PodRegistry instantiation, pod event bridge to EventBus, session re-evaluation on register/remove
- `server/src/schemas.ts`: Added ownershipBodySchema for POST /api/pods/ownership validation
- `server/src/routes/health.ts`: Updated to accept PodRegistry and return real pod count
- `server/src/index.ts`: Added PodRegistry and ownershipBodySchema barrel exports
- `extension/src/index.ts`: Integrated PodReporter initialization on session_start
- `~/.pi/agent/extensions/subagent-orchestrator/index.ts`: Added pi-fleet:request-subagent-registry response handler (~5 lines)
- `~/.pi/agent/extensions/subagent-orchestrator/wire-broker-callbacks.ts`: Emit registry-updated signal on broker register/disconnect

### Commits

- `c6ec45d` feat(server): implement PodRegistry with routes, state aggregation, and lifecycle events
- `f662981` feat(extension): implement PodReporter with inter-extension protocol
- `63cd65b3` feat: add pi-fleet registry response handler and emit registry-updated signal (subagent-orchestrator)
- `3e75026` test(server): add pod route integration tests

### Test Results

Server (91 tests):
```
 Test Files  8 passed (8)
      Tests  91 passed (91)
   Duration  676ms
```

Extension (85 tests):
```
 Test Files  6 passed (6)
      Tests  85 passed (85)
   Duration  186ms
```

Typecheck: `tsc --noEmit` passes in both server and extension packages.

### Design Decisions

1. **PodRegistry as a class (not factory function):** Matches SessionRegistry pattern established in ticket #3. Provides clear interface, internal state encapsulation, and consistent API style across registries.

2. **Pod computation on-demand (not cached):** `getPods()` computes pods fresh each call by iterating the ownership map and session registry. With expected scale (<50 sessions), caching adds complexity for negligible gain. Revisit if pod count grows significantly.

3. **Re-evaluation on session register (not periodic poll):** When a session registers, we check if it matches any pending ownership claim. This is event-driven and immediate, avoiding polling overhead while ensuring unmatched subagentIds are picked up as soon as the session appears.

4. **Signal emission in wire-broker-callbacks:** Rather than adding a new file, the `registry-updated` signal is emitted in the existing `onRegister` and `onDisconnect` callbacks. This keeps the subagent-orchestrator changes minimal (~8 lines total across 2 files).
