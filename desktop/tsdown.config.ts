import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["src/main.ts"],
    format: "cjs",
    platform: "node",
    target: "es2022",
    sourcemap: true,
    deps: {
      alwaysBundle: [/^@pi-fleet\//],
      neverBundle: ["electron"],
    },
  },
  {
    entry: ["src/preload.ts"],
    format: "cjs",
    platform: "node",
    target: "es2022",
    sourcemap: true,
    deps: {
      neverBundle: ["electron"],
    },
  },
]);
