# Review: Ticket 3 — Server Core: Session Registry + SSE

**Reviewer:** automated
**Date:** 2026-05-15
**Ticket:** `tickets/03-server-core.md`

---

## 1. Acceptance Criteria Audit

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | `POST /api/sessions/register` validates with Zod, stores, emits `session:added`, returns 201 | ✅ Met | Verified via `server.test.ts` and route code |
| 2 | `POST /api/sessions/:id/heartbeat` merges all fields, emits `session:updated`, returns 200 | ✅ Met | All optional fields merged; tested explicitly |
| 3 | `POST /api/sessions/:id/unregister` removes, emits `session:removed`, 200/404 | ✅ Met | |
| 4 | `GET /api/sessions` returns full session list | ✅ Met | |
| 5 | `GET /api/events` SSE stream with `connected` event + broadcasts | ✅ Met | Integration test in `sse.test.ts` |
| 6 | SSE keep-alive heartbeat every 30s | ✅ Met | Uses `SSE_KEEPALIVE_MS` constant; timer set up in `routes/events.ts:24` |
| 7 | Session reaper removes stale sessions (15s) | ✅ Met | Tested with injectable clock |
| 8 | `GET /api/health` returns status, uptime, sessions, pods, version | ✅ Met | |
| 9 | Port conflict: clear error on busy port | ✅ Met | Tested in `sse.test.ts` |
| 10 | Structured JSON logging to `~/Library/Logs/PiFleet/pi-fleet.log` | ✅ Met | `utils/logger.ts` appends to correct path |
| 11 | Unit tests for SessionRegistry | ✅ Met | 15 tests covering register, heartbeat merge, reap, duplicate |
| 12 | Unit tests for Zod schemas | ✅ Met | 18 tests covering valid/invalid payloads |

All 12 acceptance criteria are met.

---

## 2. Code Quality

### Overall Assessment

The implementation is clean, well-structured, and follows established patterns from prior tickets. File decomposition is appropriate: each file has a single responsibility, all are well under 300 lines, and the code is readable.

### Strengths

- **Factory pattern**: `createServer()` returns a testable instance with injectable deps. Excellent for isolation in tests.
- **Injectable clock**: `SessionRegistry` accepts `now: () => number` for deterministic reap testing. Textbook testability.
- **Single event bridge**: All SSE broadcasts flow through one `registry.onEvent` listener in `server.ts`, preventing double-broadcasts. This is called out in design decisions and is the correct pattern.
- **Typed events**: `SessionEvent` union provides type safety without EventEmitter cast overhead.
- **Clean separation**: Routes are thin adapters that validate and delegate. Business logic lives in the registry.
- **Consistent logging**: Uses the structured `log()` pattern from the backend skill.
- **`unref()` on timers**: Prevents dangling timers from blocking process exit.

### File-by-File Notes

**`server.ts`** (93 lines): Clean orchestration. Factory creates deps, wires routes, bridges events. No concerns.

**`session-registry.ts`** (142 lines): Well-structured. Heartbeat merges only present fields. Reap logic is clean with proper event emission.

**`event-bus.ts`** (38 lines): Minimal, focused adapter. Error handling removes failed clients on broadcast.

**`schemas.ts`** (41 lines): Zod schemas match the shared types. Validation constraints are appropriate (min(1), positive(), nonnegative()).

**`routes/sessions.ts`** (60 lines): Thin handlers, correct status codes, validation errors include field-level issues.

**`routes/events.ts`** (49 lines): Proper SSE headers, `reply.hijack()` usage, clean disconnect handling.

**`routes/health.ts`** (21 lines): Straightforward.

**`utils/logger.ts`** (32 lines): Creates log directory lazily, falls back to stderr on error. Good resilience.

**`index.ts`** (barrel): Exports all public interfaces cleanly.

---

## 3. Test Quality

### Coverage

- **5 test files, 59 tests**: Good coverage across unit and integration levels.
- **Unit tests** (`session-registry.test.ts`, `schemas.test.ts`, `event-bus.test.ts`): Test through public interfaces, not implementation details.
- **Integration tests** (`server.test.ts`): Use Fastify's `inject()` for HTTP testing without network overhead.
- **Network integration** (`sse.test.ts`): Real HTTP connections verify SSE behavior end-to-end.

### Strengths

- Factory functions (`buildRegisterBody`, `buildHeartbeatBody`) for test fixtures with partial overrides.
- Injectable clock makes reap tests deterministic, no `setTimeout` in tests.
- Tests verify both the returned value and emitted events.
- Edge cases covered: duplicate registration, unknown session heartbeat, re-unregister 404.
- Logger is silenced via `vi.mock` so test output is clean.

### No Issues Found

Tests assert meaningful outcomes, cover edge cases, and don't use weak assertions. The approach of verifying behavior through the public API is correct.

---

## 4. Issues

### 🟡 Should Fix

**1. Heartbeat route doesn't validate session ID consistency**
- **File:** `server/src/routes/sessions.ts:34-49`
- **Problem:** The heartbeat route takes `:id` from the URL params but uses `result.data.sessionId` from the body for the registry lookup (via `registry.heartbeat(result.data)`). If the URL param `id` differs from the body's `sessionId`, the route silently uses the body's value. This could confuse API consumers.
- **Suggested fix:** Either validate that `request.params.id === result.data.sessionId` and return 400 on mismatch, or remove `sessionId` from the body and take it from the URL param. The spec shows `sessionId` in the body, so validation is the safer fix:
  ```typescript
  if (request.params.id !== result.data.sessionId) {
    return reply.status(400).send({ error: "URL param and body sessionId mismatch" });
  }
  ```

**2. EventBus `broadcast` silently removes clients on error without logging**
- **File:** `server/src/event-bus.ts:28-33`
- **Problem:** When a client's `send()` throws, the client is removed from the map without any logging. This is correct for resilience but makes it hard to debug connection issues.
- **Suggested fix:** Add a debug-level log entry when a client is removed due to error.

### 🟢 Nits

**3. `data: {} as Record<string, never>` for heartbeat SSE event**
- **File:** `server/src/routes/events.ts:26`
- **Problem:** The cast `as Record<string, never>` is a type assertion to satisfy the `SSEEvent` union for the heartbeat type. It's not incorrect but is slightly noisy.
- **Note:** This is a consequence of the shared type definition (`data: Record<string, never>`) which requires an empty object. The cast is harmless and the simplest approach given the type constraint.

**4. Version hardcoded in health route**
- **File:** `server/src/routes/health.ts:14`
- **Problem:** `version: "0.1.0"` is hardcoded rather than read from `package.json`.
- **Note:** Acceptable for now. A future ticket could inject the version at build time.

---

## 5. Verdict

✅ **Approve**

All 12 acceptance criteria are met. Tests are thorough (59 tests, all passing). Code quality is high: clean architecture, proper decomposition, injectable dependencies, type safety throughout. The two "should fix" items are minor robustness improvements, neither is a bug or correctness issue. The implementation makes good design decisions (single event bridge, callback events over EventEmitter, deferred `@fastify/static`) and documents them clearly.

The session ID mismatch issue (🟡 #1) is worth addressing in a follow-up but does not block approval since the extension client (the sole API consumer) will always send consistent values.
