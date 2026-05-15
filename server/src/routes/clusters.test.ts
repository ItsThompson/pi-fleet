import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type PiFleetServer } from "../server.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";

describe("cluster routes", () => {
  let server: PiFleetServer;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `pi-fleet-cluster-test-${randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });
    const configPath = join(tempDir, "config.json");

    server = createServer({
      port: 0,
      host: "127.0.0.1",
      configPath,
    });
    await server.app.ready();
  });

  afterEach(async () => {
    await server.stop();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("POST /api/clusters", () => {
    it("creates a cluster with name", async () => {
      const response = await server.app.inject({
        method: "POST",
        url: "/api/clusters",
        payload: { name: "Work" },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toBeDefined();
      expect(body.name).toBe("Work");
      expect(body.directories).toEqual([]);
      expect(body.sortOrder).toBe(0);
    });

    it("creates a cluster with directories", async () => {
      const response = await server.app.inject({
        method: "POST",
        url: "/api/clusters",
        payload: { name: "Work", directories: ["~/workplace/"] },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.directories).toEqual(["~/workplace/"]);
    });

    it("returns 400 for missing name", async () => {
      const response = await server.app.inject({
        method: "POST",
        url: "/api/clusters",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("PATCH /api/clusters/:id", () => {
    it("updates cluster name", async () => {
      const createRes = await server.app.inject({
        method: "POST",
        url: "/api/clusters",
        payload: { name: "Old" },
      });
      const cluster = createRes.json();

      const response = await server.app.inject({
        method: "PATCH",
        url: `/api/clusters/${cluster.id}`,
        payload: { name: "New" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe("New");
    });

    it("updates cluster directories", async () => {
      const createRes = await server.app.inject({
        method: "POST",
        url: "/api/clusters",
        payload: { name: "Work", directories: ["~/old/"] },
      });
      const cluster = createRes.json();

      const response = await server.app.inject({
        method: "PATCH",
        url: `/api/clusters/${cluster.id}`,
        payload: { directories: ["~/new/"] },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().directories).toEqual(["~/new/"]);
    });

    it("returns 404 for non-existent cluster", async () => {
      const response = await server.app.inject({
        method: "PATCH",
        url: "/api/clusters/nonexistent",
        payload: { name: "Test" },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/clusters/:id", () => {
    it("deletes a cluster", async () => {
      const createRes = await server.app.inject({
        method: "POST",
        url: "/api/clusters",
        payload: { name: "Work" },
      });
      const cluster = createRes.json();

      const response = await server.app.inject({
        method: "DELETE",
        url: `/api/clusters/${cluster.id}`,
      });

      expect(response.statusCode).toBe(200);

      // Verify it's gone
      const listRes = await server.app.inject({
        method: "GET",
        url: "/api/clusters",
      });
      expect(listRes.json().clusters).toHaveLength(0);
    });

    it("returns 404 for non-existent cluster", async () => {
      const response = await server.app.inject({
        method: "DELETE",
        url: "/api/clusters/nonexistent",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /api/clusters/reorder", () => {
    it("reorders clusters", async () => {
      const c1 = (
        await server.app.inject({
          method: "POST",
          url: "/api/clusters",
          payload: { name: "First" },
        })
      ).json();
      const c2 = (
        await server.app.inject({
          method: "POST",
          url: "/api/clusters",
          payload: { name: "Second" },
        })
      ).json();

      const response = await server.app.inject({
        method: "POST",
        url: "/api/clusters/reorder",
        payload: { orderedIds: [c2.id, c1.id] },
      });

      expect(response.statusCode).toBe(200);

      const listRes = await server.app.inject({
        method: "GET",
        url: "/api/clusters",
      });
      const clusters = listRes.json().clusters;
      expect(clusters[0].id).toBe(c2.id);
      expect(clusters[1].id).toBe(c1.id);
    });
  });

  describe("POST /api/clusters/assign", () => {
    it("sets a manual assignment", async () => {
      const cluster = (
        await server.app.inject({
          method: "POST",
          url: "/api/clusters",
          payload: { name: "Work" },
        })
      ).json();

      const response = await server.app.inject({
        method: "POST",
        url: "/api/clusters/assign",
        payload: { sessionId: "sess-1", clusterId: cluster.id },
      });

      expect(response.statusCode).toBe(200);
    });

    it("clears a manual assignment with null clusterId", async () => {
      const response = await server.app.inject({
        method: "POST",
        url: "/api/clusters/assign",
        payload: { sessionId: "sess-1", clusterId: null },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("GET /api/clusters", () => {
    it("returns clusters with podIds and attentionCount", async () => {
      await server.app.inject({
        method: "POST",
        url: "/api/clusters",
        payload: { name: "Work", directories: ["~/workplace/"] },
      });

      const response = await server.app.inject({
        method: "GET",
        url: "/api/clusters",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.clusters).toHaveLength(1);
      expect(body.clusters[0].podIds).toBeDefined();
      expect(body.clusters[0].attentionCount).toBeDefined();
      expect(body.unclustered).toBeDefined();
      expect(body.unclustered.podIds).toBeDefined();
      expect(body.unclustered.attentionCount).toBeDefined();
    });

    it("assigns pods to clusters by directory matching", async () => {
      // Register a session with a cwd
      await server.app.inject({
        method: "POST",
        url: "/api/sessions/register",
        payload: {
          sessionId: "sess-1",
          pid: 1234,
          cwd: `${require("os").homedir()}/workplace/project-a`,
          tmuxTarget: null,
          startTime: new Date().toISOString(),
        },
      });

      // Create a cluster that matches
      await server.app.inject({
        method: "POST",
        url: "/api/clusters",
        payload: { name: "Work", directories: ["~/workplace/"] },
      });

      const response = await server.app.inject({
        method: "GET",
        url: "/api/clusters",
      });

      const body = response.json();
      expect(body.clusters[0].podIds).toContain("sess-1");
      expect(body.unclustered.podIds).not.toContain("sess-1");
    });
  });
});
