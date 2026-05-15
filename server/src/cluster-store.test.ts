import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createClusterStore, type ClusterStore } from "./cluster-store.js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import type { ClusterConfig } from "@pi-fleet/shared";

function createTempConfigPath(): string {
  const dir = join(tmpdir(), `pi-fleet-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, "config.json");
}

function writeConfig(configPath: string, config: ClusterConfig): void {
  mkdirSync(join(configPath, ".."), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

describe("ClusterStore", () => {
  let configPath: string;
  let store: ClusterStore;
  let onChangeSpy: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    configPath = createTempConfigPath();
    onChangeSpy = vi.fn<() => void>();
    store = createClusterStore({ configPath, onChange: onChangeSpy });
  });

  afterEach(() => {
    store.dispose();
    vi.useRealTimers();
    // Clean up temp dir
    try {
      rmSync(join(configPath, ".."), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("initialization", () => {
    it("starts with empty config when no file exists", () => {
      const config = store.getConfig();
      expect(config.version).toBe(1);
      expect(config.clusters).toEqual([]);
      expect(config.manualAssignments).toEqual({});
    });

    it("loads existing config from disk", () => {
      store.dispose();

      const existingConfig: ClusterConfig = {
        version: 1,
        clusters: [
          { id: "c1", name: "Work", directories: ["~/work"], sortOrder: 0 },
        ],
        manualAssignments: { "sess-1": "c1" },
      };
      writeConfig(configPath, existingConfig);

      store = createClusterStore({ configPath, onChange: onChangeSpy });
      const config = store.getConfig();
      expect(config.clusters).toHaveLength(1);
      expect(config.clusters[0].name).toBe("Work");
      expect(config.manualAssignments["sess-1"]).toBe("c1");
    });

    it("cleans up orphan assignments on load", () => {
      store.dispose();

      const configWithOrphans: ClusterConfig = {
        version: 1,
        clusters: [
          { id: "c1", name: "Work", directories: [], sortOrder: 0 },
        ],
        manualAssignments: {
          "sess-1": "c1", // valid
          "sess-2": "deleted-cluster", // orphan
        },
      };
      writeConfig(configPath, configWithOrphans);

      store = createClusterStore({ configPath, onChange: onChangeSpy });
      const config = store.getConfig();

      expect(config.manualAssignments["sess-1"]).toBe("c1");
      expect(config.manualAssignments["sess-2"]).toBeUndefined();
    });
  });

  describe("createCluster", () => {
    it("creates a cluster with name and empty directories", () => {
      const cluster = store.createCluster("Work");

      expect(cluster.id).toBeDefined();
      expect(cluster.name).toBe("Work");
      expect(cluster.directories).toEqual([]);
      expect(cluster.sortOrder).toBe(0);
    });

    it("creates a cluster with directories", () => {
      const cluster = store.createCluster("Work", ["~/workplace/", "~/projects/"]);

      expect(cluster.directories).toEqual(["~/workplace/", "~/projects/"]);
    });

    it("assigns incrementing sortOrder", () => {
      const c1 = store.createCluster("First");
      const c2 = store.createCluster("Second");

      expect(c1.sortOrder).toBe(0);
      expect(c2.sortOrder).toBe(1);
    });

    it("calls onChange", () => {
      store.createCluster("Work");
      expect(onChangeSpy).toHaveBeenCalledTimes(1);
    });

    it("persists to disk after debounce", () => {
      store.createCluster("Work");

      // Not yet persisted
      expect(existsSync(configPath)).toBe(false);

      // After debounce
      vi.advanceTimersByTime(500);

      const content = readFileSync(configPath, "utf-8");
      const saved = JSON.parse(content) as ClusterConfig;
      expect(saved.clusters).toHaveLength(1);
      expect(saved.clusters[0].name).toBe("Work");
    });
  });

  describe("updateCluster", () => {
    it("updates cluster name", () => {
      const cluster = store.createCluster("Old Name");
      const updated = store.updateCluster(cluster.id, { name: "New Name" });

      expect(updated?.name).toBe("New Name");
    });

    it("updates cluster directories", () => {
      const cluster = store.createCluster("Work", ["~/old/"]);
      const updated = store.updateCluster(cluster.id, {
        directories: ["~/new/"],
      });

      expect(updated?.directories).toEqual(["~/new/"]);
    });

    it("returns undefined for non-existent cluster", () => {
      const result = store.updateCluster("nonexistent", { name: "Foo" });
      expect(result).toBeUndefined();
    });

    it("calls onChange", () => {
      const cluster = store.createCluster("Work");
      onChangeSpy.mockClear();

      store.updateCluster(cluster.id, { name: "Updated" });
      expect(onChangeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("deleteCluster", () => {
    it("removes a cluster", () => {
      const cluster = store.createCluster("Work");
      const result = store.deleteCluster(cluster.id);

      expect(result).toBe(true);
      expect(store.getClusters()).toHaveLength(0);
    });

    it("returns false for non-existent cluster", () => {
      const result = store.deleteCluster("nonexistent");
      expect(result).toBe(false);
    });

    it("clears manual assignments pointing to deleted cluster", () => {
      const cluster = store.createCluster("Work");
      store.setManualAssignment("sess-1", cluster.id);
      store.setManualAssignment("sess-2", cluster.id);

      store.deleteCluster(cluster.id);

      expect(store.getManualAssignment("sess-1")).toBeNull();
      expect(store.getManualAssignment("sess-2")).toBeNull();
    });

    it("calls onChange", () => {
      const cluster = store.createCluster("Work");
      onChangeSpy.mockClear();

      store.deleteCluster(cluster.id);
      expect(onChangeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("reorderClusters", () => {
    it("updates sortOrder based on position in orderedIds", () => {
      const c1 = store.createCluster("First");
      const c2 = store.createCluster("Second");
      const c3 = store.createCluster("Third");

      store.reorderClusters([c3.id, c1.id, c2.id]);

      const clusters = store.getClusters();
      expect(clusters[0].id).toBe(c3.id);
      expect(clusters[1].id).toBe(c1.id);
      expect(clusters[2].id).toBe(c2.id);
    });

    it("calls onChange", () => {
      const c1 = store.createCluster("First");
      const c2 = store.createCluster("Second");
      onChangeSpy.mockClear();

      store.reorderClusters([c2.id, c1.id]);
      expect(onChangeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("manual assignments", () => {
    it("sets a manual assignment", () => {
      const cluster = store.createCluster("Work");
      store.setManualAssignment("sess-1", cluster.id);

      expect(store.getManualAssignment("sess-1")).toBe(cluster.id);
    });

    it("clears a manual assignment with null", () => {
      const cluster = store.createCluster("Work");
      store.setManualAssignment("sess-1", cluster.id);
      store.setManualAssignment("sess-1", null);

      expect(store.getManualAssignment("sess-1")).toBeNull();
    });

    it("clearManualAssignment removes the assignment", () => {
      const cluster = store.createCluster("Work");
      store.setManualAssignment("sess-1", cluster.id);
      store.clearManualAssignment("sess-1");

      expect(store.getManualAssignment("sess-1")).toBeNull();
    });

    it("returns null for non-existent assignment", () => {
      expect(store.getManualAssignment("nonexistent")).toBeNull();
    });
  });

  describe("persistence", () => {
    it("debounces multiple writes", () => {
      store.createCluster("One");
      store.createCluster("Two");
      store.createCluster("Three");

      // Not yet persisted
      expect(existsSync(configPath)).toBe(false);

      vi.advanceTimersByTime(500);

      const content = readFileSync(configPath, "utf-8");
      const saved = JSON.parse(content) as ClusterConfig;
      expect(saved.clusters).toHaveLength(3);
    });

    it("flush writes immediately", () => {
      store.createCluster("Work");
      store.flush();

      expect(existsSync(configPath)).toBe(true);
      const content = readFileSync(configPath, "utf-8");
      const saved = JSON.parse(content) as ClusterConfig;
      expect(saved.clusters).toHaveLength(1);
    });

    it("config file includes version: 1", () => {
      store.createCluster("Work");
      store.flush();

      const content = readFileSync(configPath, "utf-8");
      const saved = JSON.parse(content) as ClusterConfig;
      expect(saved.version).toBe(1);
    });

    it("config file has restricted permissions", () => {
      store.createCluster("Work");
      store.flush();

      const { statSync } = require("node:fs");
      const stats = statSync(configPath);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });

  describe("assignSession", () => {
    it("uses manual override when present", () => {
      const cluster = store.createCluster("Work", ["~/other/"]);
      store.setManualAssignment("sess-1", cluster.id);

      const result = store.assignSession("sess-1", "/random/path");
      expect(result).toEqual({ clusterId: cluster.id, reason: "manual" });
    });

    it("uses directory matching when no manual override", () => {
      const home = require("node:os").homedir();
      store.createCluster("Work", ["~/workplace/"]);

      const result = store.assignSession(
        "sess-1",
        `${home}/workplace/project`,
      );
      expect(result.reason).toBe("directory");
    });

    it("returns null clusterId when no match", () => {
      store.createCluster("Work", ["~/workplace/"]);

      const result = store.assignSession("sess-1", "/no/match");
      expect(result).toEqual({ clusterId: null, reason: "none" });
    });
  });
});
