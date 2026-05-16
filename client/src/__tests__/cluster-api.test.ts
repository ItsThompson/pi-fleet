import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fetchClusters,
  createCluster,
  editCluster,
  deleteCluster,
  reorderClusters,
  assignSession,
} from "../api/cluster-api";
import type { ClusterDefinition } from "@pi-fleet/shared";

const BASE_URL = "http://127.0.0.1:8314";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

describe("cluster-api", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe("fetchClusters", () => {
    it("returns cluster list on success", async () => {
      const responseData = {
        clusters: [
          {
            id: "c1",
            name: "Work",
            directories: ["~/work/"],
            sortOrder: 0,
            podIds: ["pod-1"],
            attentionCount: 1,
          },
        ],
        unclustered: { podIds: ["pod-2"], attentionCount: 0 },
      };
      fetchSpy.mockResolvedValue(jsonResponse(responseData));

      const result = await fetchClusters(BASE_URL);

      expect(result).toEqual({ ok: true, data: responseData });
      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE_URL}/api/clusters`,
        undefined,
      );
    });

    it("returns network error on fetch rejection", async () => {
      fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

      const result = await fetchClusters(BASE_URL);

      expect(result).toEqual({ ok: false, error: "network" });
    });

    it("returns validation error on HTTP 400", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(400));

      const result = await fetchClusters(BASE_URL);

      expect(result).toEqual({ ok: false, error: "validation" });
    });

    it("returns not-found error on HTTP 404", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(404));

      const result = await fetchClusters(BASE_URL);

      expect(result).toEqual({ ok: false, error: "not-found" });
    });

    it("returns server-error on HTTP 5xx", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(500));

      const result = await fetchClusters(BASE_URL);

      expect(result).toEqual({ ok: false, error: "server-error" });
    });
  });

  describe("createCluster", () => {
    const params = { name: "Work", directories: ["~/work/"] };
    const createdCluster: ClusterDefinition = {
      id: "c1",
      name: "Work",
      directories: ["~/work/"],
      sortOrder: 0,
    };

    it("returns created cluster on success", async () => {
      fetchSpy.mockResolvedValue(jsonResponse(createdCluster, 201));

      const result = await createCluster(BASE_URL, params);

      expect(result).toEqual({ ok: true, data: createdCluster });
      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/api/clusters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
    });

    it("returns network error on fetch rejection", async () => {
      fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

      const result = await createCluster(BASE_URL, params);

      expect(result).toEqual({ ok: false, error: "network" });
    });

    it("returns validation error on HTTP 400", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(400));

      const result = await createCluster(BASE_URL, params);

      expect(result).toEqual({ ok: false, error: "validation" });
    });

    it("returns not-found error on HTTP 404", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(404));

      const result = await createCluster(BASE_URL, params);

      expect(result).toEqual({ ok: false, error: "not-found" });
    });

    it("returns server-error on HTTP 5xx", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(503));

      const result = await createCluster(BASE_URL, params);

      expect(result).toEqual({ ok: false, error: "server-error" });
    });
  });

  describe("editCluster", () => {
    const updates = { name: "Updated Work" };
    const updatedCluster: ClusterDefinition = {
      id: "c1",
      name: "Updated Work",
      directories: ["~/work/"],
      sortOrder: 0,
    };

    it("returns updated cluster on success", async () => {
      fetchSpy.mockResolvedValue(jsonResponse(updatedCluster));

      const result = await editCluster(BASE_URL, "c1", updates);

      expect(result).toEqual({ ok: true, data: updatedCluster });
      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/api/clusters/c1`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    });

    it("returns network error on fetch rejection", async () => {
      fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

      const result = await editCluster(BASE_URL, "c1", updates);

      expect(result).toEqual({ ok: false, error: "network" });
    });

    it("returns validation error on HTTP 400", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(400));

      const result = await editCluster(BASE_URL, "c1", updates);

      expect(result).toEqual({ ok: false, error: "validation" });
    });

    it("returns not-found error on HTTP 404", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(404));

      const result = await editCluster(BASE_URL, "c1", updates);

      expect(result).toEqual({ ok: false, error: "not-found" });
    });

    it("returns server-error on HTTP 5xx", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(502));

      const result = await editCluster(BASE_URL, "c1", updates);

      expect(result).toEqual({ ok: false, error: "server-error" });
    });
  });

  describe("deleteCluster", () => {
    it("returns void data on success", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(204));

      const result = await deleteCluster(BASE_URL, "c1");

      expect(result).toEqual({ ok: true, data: undefined });
      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/api/clusters/c1`, {
        method: "DELETE",
      });
    });

    it("returns network error on fetch rejection", async () => {
      fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

      const result = await deleteCluster(BASE_URL, "c1");

      expect(result).toEqual({ ok: false, error: "network" });
    });

    it("returns validation error on HTTP 400", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(400));

      const result = await deleteCluster(BASE_URL, "c1");

      expect(result).toEqual({ ok: false, error: "validation" });
    });

    it("returns not-found error on HTTP 404", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(404));

      const result = await deleteCluster(BASE_URL, "c1");

      expect(result).toEqual({ ok: false, error: "not-found" });
    });

    it("returns server-error on HTTP 5xx", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(500));

      const result = await deleteCluster(BASE_URL, "c1");

      expect(result).toEqual({ ok: false, error: "server-error" });
    });
  });

  describe("reorderClusters", () => {
    const orderedIds = ["c3", "c1", "c2"];

    it("returns void data on success", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(200));

      const result = await reorderClusters(BASE_URL, orderedIds);

      expect(result).toEqual({ ok: true, data: undefined });
      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE_URL}/api/clusters/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedIds }),
        },
      );
    });

    it("returns network error on fetch rejection", async () => {
      fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

      const result = await reorderClusters(BASE_URL, orderedIds);

      expect(result).toEqual({ ok: false, error: "network" });
    });

    it("returns validation error on HTTP 400", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(400));

      const result = await reorderClusters(BASE_URL, orderedIds);

      expect(result).toEqual({ ok: false, error: "validation" });
    });

    it("returns not-found error on HTTP 404", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(404));

      const result = await reorderClusters(BASE_URL, orderedIds);

      expect(result).toEqual({ ok: false, error: "not-found" });
    });

    it("returns server-error on HTTP 5xx", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(500));

      const result = await reorderClusters(BASE_URL, orderedIds);

      expect(result).toEqual({ ok: false, error: "server-error" });
    });
  });

  describe("assignSession", () => {
    it("returns void data on success (assign to cluster)", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(200));

      const result = await assignSession(BASE_URL, "session-1", "c1");

      expect(result).toEqual({ ok: true, data: undefined });
      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE_URL}/api/clusters/assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: "session-1", clusterId: "c1" }),
        },
      );
    });

    it("sends null clusterId for unclustering", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(200));

      const result = await assignSession(BASE_URL, "session-1", null);

      expect(result).toEqual({ ok: true, data: undefined });
      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE_URL}/api/clusters/assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: "session-1", clusterId: null }),
        },
      );
    });

    it("returns network error on fetch rejection", async () => {
      fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

      const result = await assignSession(BASE_URL, "session-1", "c1");

      expect(result).toEqual({ ok: false, error: "network" });
    });

    it("returns validation error on HTTP 400", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(400));

      const result = await assignSession(BASE_URL, "session-1", "c1");

      expect(result).toEqual({ ok: false, error: "validation" });
    });

    it("returns not-found error on HTTP 404", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(404));

      const result = await assignSession(BASE_URL, "session-1", "c1");

      expect(result).toEqual({ ok: false, error: "not-found" });
    });

    it("returns server-error on HTTP 5xx", async () => {
      fetchSpy.mockResolvedValue(emptyResponse(500));

      const result = await assignSession(BASE_URL, "session-1", "c1");

      expect(result).toEqual({ ok: false, error: "server-error" });
    });
  });
});
