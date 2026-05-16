# Review: Ticket 02 — Shared Types + Constants

**Reviewer:** automated
**Date:** 2026-05-15
**Ticket:** `tickets/02-shared-types.md`

---

## 1. Acceptance Criteria Audit

| #   | Criterion                                                                                                          | Status | Notes                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------- |
| 1   | `session.ts` exports `ActivityStatus`, `RegisteredSession`, `RegisterBody`, `HeartbeatBody`, `ContextUsagePayload` | ✅ Met | All present with correct shapes                                                               |
| 2   | `pod.ts` exports `Pod` with `leadSessionId`, `memberSessionIds`, `displayName`, `state`, `attentionCount`          | ✅ Met | Also exports `STATE_PRIORITY` (good addition)                                                 |
| 3   | `cluster.ts` exports `ClusterDefinition`, `ClusterConfig`                                                          | ✅ Met | Matches spec section 06 exactly                                                               |
| 4   | `config.ts` exports `PiFleetConfig` with version field and preferences                                             | ✅ Met | Literal type `version: 1` enables migration patterns                                          |
| 5   | `events.ts` exports `SSEEvent` discriminated union (all event types from spec 09)                                  | ✅ Met | 13 event types matching spec; ticket said "12" but implementation correctly followed the spec |
| 6   | `terminal.ts` exports `TmuxTarget`, `OpenResult`, `OpenFailureReason`                                              | ✅ Met | Matches spec section 04 exactly                                                               |
| 7   | `constants.ts` exports `SERVER_PORT`, `HEARTBEAT_INTERVAL_MS`, `REAP_TIMEOUT_MS`, `SSE_KEEPALIVE_MS`               | ✅ Met | Values match spec                                                                             |
| 8   | `paths.ts` exports `getConfigPath()`, `getLogPath()` resolving to macOS standard locations                         | ✅ Met | Also exports `getConfigDir()`, `getLogDir()`                                                  |
| 9   | `index.ts` re-exports all public types and constants                                                               | ✅ Met | Barrel covers all modules                                                                     |
| 10  | Package builds cleanly and is importable                                                                           | ✅ Met | `tsc --noEmit` passes, tests pass                                                             |

---

## 2. Code Quality

### Naming

Excellent throughout. Types use PascalCase, constants use UPPER_SNAKE_CASE, functions use camelCase. All names are descriptive and consistent with the spec.

### Structure

Clean single-responsibility decomposition:

- One file per domain concept (session, pod, cluster, config, events, terminal)
- Constants isolated from types
- Path logic separated from everything else
- Barrel index provides a single import point

All source files are well under 300 lines.

### Type Safety

- `ActivityStatus` is correctly a string union (not enum) per the technical notes, enabling Zod inference.
- `PiFleetConfig.version` uses literal type `1` (not `number`), enabling exhaustive migration checks.
- `ClusterConfig.version` similarly uses literal `1`.
- `SSEEvent` uses a proper discriminated union with `type` field.
- `OpenResult` is a correctly discriminated union on `ok`.
- No `any` types anywhere.

### Error Handling

N/A for this ticket (types-only package with constants and path utilities). Path utilities don't do filesystem operations, which is correct: directory creation is the caller's responsibility.

### Patterns

- Uses `type` exports in barrel for pure type re-exports (avoids runtime import cost).
- `.js` extensions in imports (correct for ES modules with bundler moduleResolution).
- `import type` used appropriately in `pod.ts` and `events.ts`.

---

## 3. Test Quality

### Strengths

- **constants.test.ts**: Tests exact values AND a relational invariant (`REAP_TIMEOUT_MS > HEARTBEAT_INTERVAL_MS`). Good.
- **paths.test.ts**: Tests actual resolved paths against expected values using `homedir()`. Tests behavior, not implementation.
- **index.test.ts**: Comprehensive type contract tests verify that all exported types have the correct shape and that discriminated unions narrow properly. The `SSEEvent covers all 13 event types` test documents the expected count.

### Observations

- Tests verify through the public interface (barrel exports).
- Type contract tests serve as compile-time guards: they'd break if interface shapes change, catching regressions.
- Edge cases for paths: tests assume `homedir()` returns a reasonable value. This is fine since the functions are thin wrappers over `node:path` and `node:os`.

### Potential Weakness

- The "exports all constants" test in `index.test.ts` uses `toBeDefined()` which is weaker than checking specific values. However, the dedicated `constants.test.ts` already covers exact values, so this is acceptable: the barrel test only needs to verify re-export presence.

---

## 4. Issues

### 🟢 Nit: `toBeDefined()` in barrel constant check

**File:** `shared/src/index.test.ts` lines 33-37
**Problem:** `expect(SERVER_PORT).toBeDefined()` would pass if the value was `0` or `""`. Low risk since exact-value tests exist separately.
**Suggested fix:** Could use `expect(SERVER_PORT).toBe(8314)` for consistency, but not required given the dedicated test file.

### 🟢 Nit: Consider documenting that paths are macOS-only

**File:** `shared/src/paths.ts`
**Problem:** The functions hardcode macOS paths (`Library/Application Support`, `Library/Logs`). This is intentional per spec (Electron desktop app), but a module-level comment noting "macOS-only, cross-platform support not planned" would help future contributors.
**Suggested fix:** Already has individual function-level comments mentioning "macOS:" which is sufficient. No action needed.

---

## 5. Verdict

✅ **Approve**

All 10 acceptance criteria are met. Types match the spec exactly across sections 04, 06, 08, and 09. The implementation correctly followed the spec over the ticket text where they diverged (13 events vs "12"). Build and tests pass cleanly. Code is well-structured, properly typed, and appropriately tested for a types+constants package.

**What was done well:**

- Spec-faithful implementation with no drift
- Clean file decomposition (one concept per file)
- `SSEEventType` helper type is a good ergonomic addition
- `getConfigDir`/`getLogDir` export is forward-thinking (callers need to `mkdir -p`)
- `STATE_PRIORITY` co-located with `Pod` type makes sense
- Literal `version: 1` types enable compile-time migration checks
- Test that verifies `REAP_TIMEOUT_MS > HEARTBEAT_INTERVAL_MS` catches a real invariant
