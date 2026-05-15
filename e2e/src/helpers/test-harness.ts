import { createServer, type PiFleetServer } from "@pi-fleet/server";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface TestHarness {
  server: PiFleetServer;
  baseUrl: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates an isolated test server on a random port with a temp config directory.
 * Call cleanup() when done to tear down.
 */
export async function createTestHarness(): Promise<TestHarness> {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-fleet-e2e-"));
  const configPath = join(tempDir, "clusters.json");

  const server = createServer({
    port: 0,
    host: "127.0.0.1",
    configPath,
  });

  await server.start();

  const address = server.app.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function cleanup(): Promise<void> {
    await server.stop();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }

  return { server, baseUrl, cleanup };
}
