import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

function stubNodeBuiltins(): Plugin {
  return {
    name: "stub-node-builtins",
    enforce: "pre",
    resolveId(source) {
      if (source.startsWith("node:")) {
        return { id: `\0${source}`, moduleSideEffects: false };
      }
    },
    load(id) {
      if (id.startsWith("\0node:")) {
        return "export const join = () => ''; export const resolve = () => ''; export const dirname = () => ''; export const basename = () => ''; export const homedir = () => ''; export const tmpdir = () => ''; export default {};";
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), stubNodeBuiltins()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8314",
    },
  },
});
