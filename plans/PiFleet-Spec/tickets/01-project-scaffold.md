### Ticket 1: Project Scaffold + Build

**Type:** AFK
**Blocked by:** None — can start immediately
**User stories:** N/A (infrastructure prerequisite)

#### What to build

Initialize the `~/Documents/pi-fleet/` monorepo by forking pi-watch's structure. Set up Turborepo, npm workspaces, shared TypeScript configs, and ESLint. Create the five package directories (`shared`, `server`, `client`, `desktop`, `extension`) with minimal `package.json` and `tsconfig.json` files. Install core dependencies: Electron, Fastify, React, shadcn/ui, zustand, Tailwind CSS, Vitest. Rename all references from `pi-watch` to `pi-fleet`. Verify `turbo build` succeeds with empty packages.

#### Acceptance criteria

- [ ] `~/Documents/pi-fleet/` is a git repo with first commit
- [ ] `npm install` succeeds at root (workspaces resolve)
- [ ] `turbo build` runs successfully across all five packages (even if they produce no output yet)
- [ ] `turbo test` runs vitest (no tests yet, exits 0)
- [ ] ESLint config extends a base and all packages inherit it
- [ ] Tailwind CSS configured in `client/` with shadcn `components.json`
- [ ] All `package.json` files use `@pi-fleet/` scope
- [ ] No references to `pi-watch` remain in any file

#### Technical notes

- Copy pi-watch's `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs` as starting points, then rename.
- Use `"type": "module"` in all packages for ESM.
- Electron version should match pi-watch's (reference `~/Documents/pi-watch/package.json`).
- shadcn init in `client/`: `npx shadcn@latest init` with "new-york" style, dark theme.

---

## Completion Summary

**Status:** ✅ Complete
**Completed:** 2026-05-15

### Acceptance Criteria

- ✅ `~/Documents/pi-fleet/` is a git repo with first commit
- ✅ `npm install` succeeds at root (workspaces resolve)
- ✅ `turbo build` runs successfully across all five packages (even if they produce no output yet)
- ✅ `turbo test` runs vitest (no tests yet, exits 0)
- ✅ ESLint config extends a base and all packages inherit it
- ✅ Tailwind CSS configured in `client/` with shadcn `components.json`
- ✅ All `package.json` files use `@pi-fleet/` scope
- ✅ No references to `pi-watch` remain in any file

### Changes

**Files created:**

- `.gitignore`: standard ignores for node_modules, dist, .turbo, coverage
- `package.json`: monorepo root with npm workspaces, turbo, eslint devDeps
- `turbo.json`: build/test/dev task config
- `tsconfig.base.json`: shared TS config (ES2023, bundler moduleResolution)
- `eslint.config.mjs`: typescript-eslint with curly, no-nested-ternary, max-depth rules
- `shared/package.json`: @pi-fleet/shared types package
- `shared/tsconfig.json`: extends base
- `shared/vitest.config.ts`: vitest config for shared tests
- `shared/src/index.ts`: barrel exports for types, constants, paths
- `shared/src/constants.ts`: SERVER_PORT, HEARTBEAT_INTERVAL_MS, etc.
- `shared/src/paths.ts`: getConfigDir, getConfigPath, getLogDir, getLogPath
- `shared/src/types/session.ts`: ActivityStatus, RegisterBody, HeartbeatBody, RegisteredSession
- `shared/src/types/pod.ts`: Pod type, STATE_PRIORITY
- `shared/src/types/cluster.ts`: ClusterDefinition, ClusterConfig
- `shared/src/types/config.ts`: PiFleetConfig
- `shared/src/types/events.ts`: SSEEvent discriminated union, SSEEventType
- `shared/src/types/terminal.ts`: TmuxTarget, OpenResult, OpenFailureReason
- `shared/src/index.test.ts`: barrel export verification tests (26 tests)
- `server/package.json`: @pi-fleet/server with Fastify, Zod deps
- `server/tsconfig.json`: extends base with vitest/globals
- `server/tsconfig.build.json`: excludes test files from build
- `server/tsdown.config.ts`: ESM bundler config
- `server/src/index.ts`: empty entry
- `client/package.json`: @pi-fleet/client with React, zustand, shadcn deps
- `client/tsconfig.json`: extends base, JSX, path aliases
- `client/tsconfig.build.json`: excludes test files
- `client/tailwind.config.ts`: shadcn dark theme with CSS variables
- `client/postcss.config.cjs`: tailwind + autoprefixer plugins
- `client/vite.config.ts`: React plugin, node builtins stub, @ alias
- `client/vitest.config.ts`: jsdom env, test-setup, shared alias
- `client/components.json`: shadcn new-york style, dark, CSS variables
- `client/index.html`: minimal HTML entry
- `client/src/main.tsx`: React root mount
- `client/src/index.css`: Tailwind directives + shadcn CSS variables (dark)
- `client/src/lib/utils.ts`: cn() utility (clsx + tailwind-merge)
- `client/src/test-setup.ts`: @testing-library/jest-dom/vitest setup
- `desktop/package.json`: @pi-fleet/desktop with Electron 35, electron-builder
- `desktop/tsconfig.json`: extends base
- `desktop/tsdown.config.ts`: CJS format for Electron main process
- `desktop/src/main.ts`: empty entry
- `extension/package.json`: @pi-fleet/extension with pi-coding-agent devDep
- `extension/tsconfig.json`: extends base
- `extension/tsdown.config.ts`: ESM bundler, bundles all deps
- `extension/src/index.ts`: empty entry
- `e2e/package.json`: @pi-fleet/e2e with Playwright
- `e2e/tsconfig.json`: extends base

### Commits

- `31c2929` chore: initialize pi-fleet monorepo scaffold
- `37d0a6e` fix: add tsdown configs and passWithNoTests for turbo compatibility

### Test Results

```
 Tasks:    11 successful, 11 total
 Cached:    0 cached, 11 total
  Time:    2.213s

@pi-fleet/shared:test: Test Files  3 passed (3)
@pi-fleet/shared:test:      Tests  26 passed (26)
```

### Design Decisions

1. **--passWithNoTests over placeholder test files:** Rather than adding dummy test files to each empty package, used vitest's `--passWithNoTests` flag. Cleaner: no fake tests to delete later.

2. **shadcn configured manually vs. `npx shadcn init`:** The shadcn CLI init requires interactive prompts. Instead, created `components.json`, `tailwind.config.ts`, `index.css`, and `lib/utils.ts` manually using the new-york dark theme values. Functionally equivalent, verified by successful Tailwind CSS compilation with all CSS variables present.

3. **Electron version 35:** Matched pi-watch's electron@35.0.0 range per the technical notes. The electron-builder config uses electronVersion 35.7.5 matching pi-watch's build config.

4. **Pre-existing shared types included:** The shared package had pre-existing type definitions (session, pod, cluster, config, events, terminal) and test files from a prior scaffold setup. These align perfectly with the spec's architecture (Section 03) so they were kept and committed as part of the scaffold.
