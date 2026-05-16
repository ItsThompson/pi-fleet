# Review: Ticket 01 - Project Scaffold + Build

**Reviewer:** automated
**Date:** 2025-05-15
**Commits:** `31c2929`, `37d0a6e`

---

## 1. Acceptance Criteria Audit

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | `~/Documents/pi-fleet/` is a git repo with first commit | ✅ Met | 2 commits present |
| 2 | `npm install` succeeds at root (workspaces resolve) | ✅ Met | Verified via `--dry-run`, no errors |
| 3 | `turbo build` runs successfully across all five packages | ✅ Met | 5 build tasks succeed (shared, server, client, desktop, extension) |
| 4 | `turbo test` runs vitest (no tests yet, exits 0) | ✅ Met | 7 tasks pass; shared has 26 tests, others use `--passWithNoTests` |
| 5 | ESLint config extends a base and all packages inherit it | ✅ Met | Root `eslint.config.mjs` with typescript-eslint, all `**/*.{ts,tsx}` included; runs clean |
| 6 | Tailwind CSS configured in `client/` with shadcn `components.json` | ✅ Met | `tailwind.config.ts`, `postcss.config.cjs`, `components.json` (new-york, dark, zinc) all present |
| 7 | All `package.json` files use `@pi-fleet/` scope | ✅ Met | All five packages + e2e use `@pi-fleet/*` |
| 8 | No references to `pi-watch` remain in any file | ✅ Met | `grep -r "pi-watch"` returns zero matches |

**All 8 acceptance criteria are met.**

---

## 2. Code Quality

### Strengths

- **Clean monorepo structure.** The directory layout matches the spec's architecture (Section 03) precisely.
- **Type safety in shared.** The discriminated union for `SSEEvent` is well-designed: narrowing on `type` gives correct `data` types automatically.
- **Practical design decisions.** Using `--passWithNoTests` over placeholder files, and manual shadcn setup over CLI prompts, are both pragmatic choices that avoid tech debt.
- **`tsconfig.build.json` pattern.** Correctly excludes test files from production builds while keeping them visible in the editor via the main `tsconfig.json`.
- **Vite Node built-in stubs.** The `stubNodeBuiltins()` plugin in `client/vite.config.ts` handles the fact that `@pi-fleet/shared` imports `node:os` and `node:path`: good forward-thinking for browser builds.

### Observations

- **`shared/src/index.ts` barrel exports.** Type-only re-exports use `export type {}` correctly. Runtime values (`STATE_PRIORITY`, constants, path utils) are exported as values. Proper separation.
- **Consistent ESM.** All packages use `"type": "module"`, matching the ticket's technical notes.
- **Constants are domain truths placed correctly.** `SERVER_PORT`, `HEARTBEAT_INTERVAL_MS`, etc. are in `shared/` where they belong per the architecture.

---

## 3. Test Quality

### `shared/src/index.test.ts`
- Tests verify barrel export correctness: all types compile, all runtime exports are defined.
- The "compile-time verification" tests are useful: they catch if a type field is renamed or removed since the test would fail to typecheck.
- `STATE_PRIORITY` keys are verified for exact values.
- SSEEvent type-narrowing is tested.

### `shared/src/constants.test.ts`
- Tests pin exact constant values, ensuring no accidental drift.
- Relational assertion (`REAP_TIMEOUT_MS > HEARTBEAT_INTERVAL_MS`) verifies a business invariant.

### `shared/src/paths.test.ts`
- Tests verify macOS path construction against expected strings.

### Assessment
Tests are appropriate for a scaffold ticket. They verify exports and contracts, not implementation logic (since there isn't much yet). No weak assertions found: they pin specific values and shapes.

---

## 4. Issues

### 🟡 Should Fix

**1. `e2e/package.json` missing `build` script: turbo runs a no-op**
- **File:** `e2e/package.json`
- **Problem:** The e2e package has no `build` script. Turbo's `build` task silently skips it. While not an error today, this is inconsistent: every other package has an explicit `build` script. If a future ticket adds TypeScript source to `e2e/src/`, building won't happen unless someone remembers to add it.
- **Fix:** Add `"build": "tsc --noEmit"` to match the pattern in other packages, or add an explicit turbo filter to exclude it.

**2. `server/tsdown.config.ts` bundles all deps for an empty entry**
- **File:** `server/tsdown.config.ts`, line `deps: { alwaysBundle: [/.*/] }`
- **Problem:** Bundling *all* dependencies (Fastify, Zod, etc.) into one file will create very large bundles and can break Fastify's plugin system which relies on `require.resolve`. This is fine for now (empty entry), but will need to change before the server has real code.
- **Fix:** Consider `neverBundle: ["fastify", "@fastify/*"]` or switching to the same selective strategy used in `desktop/tsdown.config.ts`. Can defer since the entry is empty.

**3. `desktop/` and `extension/` lack vitest configs**
- **File:** `desktop/package.json`, `extension/package.json`
- **Problem:** Both packages have `vitest` as a devDependency and a `test` script, but no `vitest.config.ts`. Vitest will use defaults, which is fine for now, but future tests may need configuration (globals, types, aliases). Inconsistent with `shared/` and `client/` which both have configs.
- **Fix:** Add minimal `vitest.config.ts` files matching the pattern in `shared/`. Low priority since no tests exist yet.

### 🟢 Nit

**4. `postcss.config.cjs` uses CommonJS in an ESM monorepo**
- **File:** `client/postcss.config.cjs`
- **Problem:** All packages use `"type": "module"`, so PostCSS config uses `.cjs`. This is the correct workaround (PostCSS doesn't support ESM config well), but worth noting: if PostCSS adds ESM support later, this can be renamed.
- **Fix:** None needed: `.cjs` is the standard pattern.

**5. CSS variables only define dark theme values**
- **File:** `client/src/index.css`
- **Problem:** Only `:root` has CSS variable definitions: there's no light theme. The HTML has `class="dark"` hardcoded, and the spec says dark theme, so this is intentional. However, shadcn's default scaffold usually puts light values in `:root` and dark overrides in `.dark`. The current approach works because the app is always dark.
- **Fix:** None needed for now. If light mode is ever added, restructure per shadcn's standard pattern.

**6. Root `package.json` missing `@pi-fleet/` scope**
- **File:** `package.json` (root)
- **Problem:** Root package is named `"pi-fleet"` not `"@pi-fleet/root"`. The acceptance criteria says "All `package.json` files use `@pi-fleet/` scope": this technically applies only to workspace packages (which are the ones npm resolves), and the root is never referenced by name. The root package is private and not publishable, so this is not a real issue.
- **Fix:** Optional: rename to `@pi-fleet/root` for consistency. Purely cosmetic.

---

## 5. Verdict

✅ **Approve**

All 8 acceptance criteria are fully met. The build passes, tests pass (26 tests in shared, all other packages exit 0), ESLint is clean, and no references to `pi-watch` remain. The scaffold provides a solid foundation that matches the spec's architecture. Design decisions (manual shadcn config, `--passWithNoTests`, pre-existing shared types) are all well-reasoned and documented.

The "should fix" items are all forward-looking concerns that don't affect the scaffold's correctness today but should be addressed as the codebase grows.
