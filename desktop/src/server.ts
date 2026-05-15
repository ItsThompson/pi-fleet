import { dialog, app } from "electron";
import { join } from "node:path";
import { createServer as createPiFleetServer } from "@pi-fleet/server";
import type { PiFleetServer } from "@pi-fleet/server";
import { SERVER_PORT } from "@pi-fleet/shared";

export interface EmbeddedServer {
  instance: PiFleetServer | null;
  start(): Promise<boolean>;
  stop(): Promise<void>;
  getUrl(): string;
}

/**
 * Manages the embedded Fastify server lifecycle.
 * Handles port conflict detection with a retry dialog.
 */
export function createEmbeddedServer(): EmbeddedServer {
  let instance: PiFleetServer | null = null;

  async function start(): Promise<boolean> {
    return attemptStart();
  }

  async function attemptStart(): Promise<boolean> {
    try {
      const staticDir = resolveClientDist();
      instance = createPiFleetServer({ port: SERVER_PORT, host: "127.0.0.1", staticDir });
      await instance.start();
      return true;
    } catch (error) {
      instance = null;
      const isPortConflict = isAddressInUse(error);

      if (isPortConflict) {
        return handlePortConflict();
      }

      // Non-port error: show generic error
      const message = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox("Pi Fleet: Server Error", message);
      return false;
    }
  }

  async function handlePortConflict(): Promise<boolean> {
    const result = await dialog.showMessageBox({
      type: "error",
      title: "Pi Fleet: Port Conflict",
      message: `Port ${SERVER_PORT} is already in use`,
      detail:
        "Another instance of pi-fleet or pi-watch may be running on port " +
        `${SERVER_PORT}. Close the other application and try again.`,
      buttons: ["Retry", "Quit"],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      // Retry
      return attemptStart();
    }

    // User chose Quit: signal failure but don't force-quit here
    // (let main.ts handle the app lifecycle)
    return false;
  }

  async function stop(): Promise<void> {
    if (instance) {
      await instance.stop();
      instance = null;
    }
  }

  function getUrl(): string {
    return `http://127.0.0.1:${SERVER_PORT}`;
  }

  return {
    get instance() {
      return instance;
    },
    start,
    stop,
    getUrl,
  };
}

function isAddressInUse(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("eaddrinuse") ||
      message.includes("address already in use")
    );
  }
  return false;
}

/**
 * Resolve the client dist directory.
 * In production (packaged): extraResources/client/dist
 * In development (monorepo): ../client/dist relative to project root
 */
function resolveClientDist(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "client", "dist");
  }
  // Development: desktop/dist/main.cjs → ../../client/dist
  return join(__dirname, "..", "..", "client", "dist");
}
