### Ticket 3: Server Core: Session Registry + SSE

**Type:** AFK
**Blocked by:** #1, #2
**User stories:** US-DATA-01, US-SETUP-03, US-SETUP-04

#### What to build

Build the Fastify server with session lifecycle endpoints and SSE event streaming. This is the backbone that all other features build on. Implements: `SessionRegistry` (in-memory store with add/update/remove/reap), SSE `EventBus` (fan-out to connected clients), session routes (`POST /register`, `POST /:id/heartbeat`, `POST /:id/unregister`, `GET /sessions`), SSE route (`GET /events`), health route (`GET /health`), and Zod validation schemas. The server binds to `127.0.0.1:8314`.

#### Acceptance criteria

- [ ] `POST /api/sessions/register` validates payload with Zod, stores session, emits `session:added` SSE event, returns 201
- [ ] `POST /api/sessions/:id/heartbeat` merges all fields (activity, model, contextUsage, turnCount, thinkingLevel, lastToolName), emits `session:updated`, returns 200
- [ ] `POST /api/sessions/:id/unregister` removes session, emits `session:removed`, returns 200 (404 if already gone)
- [ ] `GET /api/sessions` returns full session list (used on SSE reconnect)
- [ ] `GET /api/events` opens SSE stream, sends `connected` event with `serverTime`, then broadcasts session/pod/cluster events
- [ ] SSE keep-alive heartbeat sent every 30s
- [ ] Session reaper runs on interval: sessions not seen for 15s are removed and `session:removed` is emitted
- [ ] `GET /api/health` returns `{ status: "ok", uptime, sessions, pods, version }`
- [ ] Port conflict: if 8314 is busy, server creation rejects with clear error message
- [ ] Structured JSON logging to `~/Library/Logs/PiFleet/pi-fleet.log`
- [ ] Unit tests for SessionRegistry (register, heartbeat merge, reap, duplicate handling)
- [ ] Unit tests for Zod schemas (valid payloads pass, invalid rejected with field-level errors)

#### Technical notes

- Use Fastify with `@fastify/static` (for future client serving). Server is a factory: `createServer()` returns the instance for testability.
- `SessionRegistry` is a class with an internal `Map<string, RegisteredSession>`. Emits typed events via Node `EventEmitter` or a simple callback.
- Reaper: `setInterval` that scans `lastSeen` timestamps. Inject `Date.now` for testability.
- SSE implementation: set headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`. Write `event: <type>\ndata: <json>\n\n` format.
- All new heartbeat fields (`model`, `contextUsage`, etc.) are optional: only merge if present.

---

## Completion Summary

**Status:** ✅ Complete
**Completed:** 2026-05-15

### Acceptance Criteria

- ✅ `POST /api/sessions/register` validates payload with Zod, stores session, emits `session:added` SSE event, returns 201
- ✅ `POST /api/sessions/:id/heartbeat` merges all fields (activity, model, contextUsage, turnCount, thinkingLevel, lastToolName), emits `session:updated`, returns 200
- ✅ `POST /api/sessions/:id/unregister` removes session, emits `session:removed`, returns 200 (404 if already gone)
- ✅ `GET /api/sessions` returns full session list (used on SSE reconnect)
- ✅ `GET /api/events` opens SSE stream, sends `connected` event with `serverTime`, then broadcasts session/pod/cluster events
- ✅ SSE keep-alive heartbeat sent every 30s
- ✅ Session reaper runs on interval: sessions not seen for 15s are removed and `session:removed` is emitted
- ✅ `GET /api/health` returns `{ status: "ok", uptime, sessions, pods, version }`
- ✅ Port conflict: if 8314 is busy, server creation rejects with clear error message
- ✅ Structured JSON logging to `~/Library/Logs/PiFleet/pi-fleet.log`
- ✅ Unit tests for SessionRegistry (register, heartbeat merge, reap, duplicate handling)
- ✅ Unit tests for Zod schemas (valid payloads pass, invalid rejected with field-level errors)

### Changes

**Files created:**
- `server/src/server.ts`: Server factory with route registration, EventBus wiring, start/stop lifecycle
- `server/src/session-registry.ts`: In-memory session store with register/heartbeat/unregister/reap and typed event emission
- `server/src/event-bus.ts`: SSE fan-out to connected clients with disconnect handling
- `server/src/schemas.ts`: Zod validation schemas for register and heartbeat payloads
- `server/src/routes/sessions.ts`: Session lifecycle HTTP endpoint handlers
- `server/src/routes/events.ts`: SSE streaming endpoint with connected event and keep-alive
- `server/src/routes/health.ts`: Health check endpoint
- `server/src/utils/logger.ts`: Structured JSON logging to file
- `server/src/dev.ts`: Development entry point for local testing
- `server/vitest.config.ts`: Test configuration with globals
- `server/src/schemas.test.ts`: Zod schema validation tests (18 tests)
- `server/src/session-registry.test.ts`: Registry logic tests (15 tests)
- `server/src/event-bus.test.ts`: EventBus broadcast and client management tests (6 tests)
- `server/src/server.test.ts`: Route integration tests via Fastify inject (15 tests)
- `server/src/sse.test.ts`: SSE + port conflict integration tests with real HTTP (5 tests)

**Files modified:**
- `server/src/index.ts`: Added barrel exports for server factory, registry, EventBus, schemas
- `server/tsconfig.build.json`: Excluded test and dev files from production build

### Commits

- `ced1a56` feat(server): implement server core with session registry, SSE, and routes
- `0be6dc3` test(server): add unit and integration tests for server core

### Test Results

```
 RUN  v4.1.6 /Users/thompsnt/Documents/pi-fleet/server

 Test Files  5 passed (5)
      Tests  59 passed (59)
   Start at  21:17:00
   Duration  614ms
```

Typecheck: `tsc --noEmit` passes with no errors.
Build: `tsdown` produces dist/index.mjs (1.62 MB bundled).

### Design Decisions

1. **Single event bridge pattern**: Rather than having routes broadcast SSE events directly AND a registry listener also broadcasting, all SSE broadcasts flow through a single `registry.onEvent` listener in `server.ts`. This prevents double-broadcasting when both route and reaper trigger the same event type.

2. **Callback-based events over EventEmitter**: SessionRegistry uses a simple listener array with typed `SessionEvent` union instead of Node's EventEmitter. Provides type safety without cast overhead and is simpler to test.

3. **`@fastify/static` deferred**: The ticket notes mention it for future client serving, but it's not needed for this ticket's acceptance criteria. Adding it now would be dead code. It will be registered when the desktop package embeds the client build.

4. **Port 0 for tests**: Integration tests use `port: 0` (OS-assigned) to avoid conflicts with a running dev server or between parallel test runs. The port conflict test explicitly starts two servers on the same port.

5. **Reaper timer `.unref()`**: The reaper interval is unref'd so it doesn't prevent process exit during tests or graceful shutdown. The `dispose()` method still clears it explicitly.
