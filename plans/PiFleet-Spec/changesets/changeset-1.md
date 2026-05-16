# Changeset 1: Project Scaffold + Build

**Ticket:** `/Users/thompsnt/Desktop/PiFleet-Spec/tickets/01-project-scaffold.md`
**Date:** 2026-05-15

## Summary

Initialized the `~/Documents/pi-fleet/` monorepo by forking pi-watch's structure. Set up Turborepo, npm workspaces, shared TypeScript configs, ESLint, and all five packages (shared, server, client, desktop, extension) plus e2e.

## Commits

- `31c2929` chore: initialize pi-fleet monorepo scaffold
- `37d0a6e` fix: add tsdown configs and passWithNoTests for turbo compatibility

## Verification

- `npm install`: ✅ succeeds (879 packages)
- `turbo build`: ✅ 5/5 packages build successfully
- `turbo test`: ✅ 6/6 packages pass (26 tests in shared, others exit 0)
- ESLint: ✅ runs across all packages
- No pi-watch references: ✅ verified with grep

## Files Changed

45+ files created across the monorepo scaffold. See ticket completion summary for full list.
