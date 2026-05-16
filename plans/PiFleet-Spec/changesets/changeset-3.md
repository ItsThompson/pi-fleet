# Changeset 3: Server Core: Session Registry + SSE

**Ticket:** #3 — Server Core: Session Registry + SSE
**Status:** ✅ Complete
**Date:** 2026-05-15

## Commits

- `ced1a56` feat(server): implement server core with session registry, SSE, and routes
- `0be6dc3` test(server): add unit and integration tests for server core

## Files Created

| Path                                  | Purpose                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `server/src/server.ts`                | Server factory with route registration, EventBus wiring, start/stop lifecycle            |
| `server/src/session-registry.ts`      | In-memory session store with register/heartbeat/unregister/reap and typed event emission |
| `server/src/event-bus.ts`             | SSE fan-out to connected clients with disconnect handling                                |
| `server/src/schemas.ts`               | Zod validation schemas for register and heartbeat payloads                               |
| `server/src/routes/sessions.ts`       | Session lifecycle HTTP endpoint handlers                                                 |
| `server/src/routes/events.ts`         | SSE streaming endpoint with connected event and keep-alive                               |
| `server/src/routes/health.ts`         | Health check endpoint                                                                    |
| `server/src/utils/logger.ts`          | Structured JSON logging to ~/Library/Logs/PiFleet/pi-fleet.log                           |
| `server/src/dev.ts`                   | Development entry point for local testing                                                |
| `server/vitest.config.ts`             | Test configuration with globals                                                          |
| `server/src/schemas.test.ts`          | Zod schema validation tests (18 tests)                                                   |
| `server/src/session-registry.test.ts` | Registry logic tests (15 tests)                                                          |
| `server/src/event-bus.test.ts`        | EventBus broadcast and client management tests (6 tests)                                 |
| `server/src/server.test.ts`           | Route integration tests via Fastify inject (15 tests)                                    |
| `server/src/sse.test.ts`              | SSE + port conflict integration tests with real HTTP (5 tests)                           |

## Files Modified

| Path                         | Change                                                               |
| ---------------------------- | -------------------------------------------------------------------- |
| `server/src/index.ts`        | Added barrel exports for server factory, registry, EventBus, schemas |
| `server/tsconfig.build.json` | Excluded test and dev files from production build                    |

## Test Results

```
 RUN  v4.1.6 /Users/thompsnt/Documents/pi-fleet/server

 Test Files  5 passed (5)
      Tests  59 passed (59)
   Start at  21:17:00
   Duration  614ms
```

- TypeScript: `tsc --noEmit` passes with no errors
- Build: `tsdown` produces dist/index.mjs (1.62 MB bundled)
- Turbo: `turbo test --filter=@pi-fleet/server` passes (2 tasks successful)

## Runtime Verification

Server starts on 127.0.0.1:8314. Verified with curl:

- `GET /api/health` → `{ status: "ok", uptime, sessions, pods, version }`
- `POST /api/sessions/register` → 201 with valid payload, 400 with field-level errors on invalid
- `POST /api/sessions/:id/heartbeat` → 200 merges all fields, 404 for unknown session
- `POST /api/sessions/:id/unregister` → 200 removes session, 404 if already gone
- `GET /api/sessions` → full session list
- `GET /api/events` → SSE stream with `event: connected` and `serverTime`
- Reaper removes stale sessions after 15s (verified via log output)
- Structured JSON logging written to `~/Library/Logs/PiFleet/pi-fleet.log`

## Design Decisions

1. **Single event bridge pattern**: All SSE broadcasts flow through one `registry.onEvent` listener in server.ts, preventing double-broadcast when both route handler and reaper trigger the same event.
2. **Callback-based events over EventEmitter**: Typed `SessionEvent` union with listener array provides compile-time safety without casts.
3. **`@fastify/static` deferred**: Not needed for this ticket's criteria; will be added when desktop embeds client build.
4. **Port 0 for tests**: OS-assigned ports avoid conflicts between test runs and running dev server.
5. **Reaper timer `.unref()`**: Prevents timer from blocking process exit during tests or graceful shutdown.
