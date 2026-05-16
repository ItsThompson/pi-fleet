import type { ClusterDefinition } from "@pi-fleet/shared";

/** Discriminated result for API operations */
export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: "network" | "validation" | "not-found" | "server-error";
    };

/** Cluster list response shape from GET /api/clusters */
export interface ClusterListResponse {
  clusters: Array<
    ClusterDefinition & { podIds: string[]; attentionCount: number }
  >;
  unclustered: { podIds: string[]; attentionCount: number };
}

/**
 * Internal helper: executes a fetch and maps the response to ApiResult.
 * All error paths produce a typed return value: nothing is silently swallowed.
 */
async function apiCall<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return { ok: false, error: "network" };
  }

  if (response.ok) {
    const data = (await response.json()) as T;
    return { ok: true, data };
  }

  if (response.status === 400) {
    return { ok: false, error: "validation" };
  }
  if (response.status === 404) {
    return { ok: false, error: "not-found" };
  }
  return { ok: false, error: "server-error" };
}

/**
 * Variant for endpoints that return no body on success (204 or empty).
 */
async function apiCallVoid(
  url: string,
  init?: RequestInit,
): Promise<ApiResult<void>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return { ok: false, error: "network" };
  }

  if (response.ok) {
    return { ok: true, data: undefined };
  }

  if (response.status === 400) {
    return { ok: false, error: "validation" };
  }
  if (response.status === 404) {
    return { ok: false, error: "not-found" };
  }
  return { ok: false, error: "server-error" };
}

/**
 * Fetch all clusters with pod membership.
 */
export async function fetchClusters(
  baseUrl: string,
): Promise<ApiResult<ClusterListResponse>> {
  return apiCall<ClusterListResponse>(`${baseUrl}/api/clusters`);
}

/**
 * Create a new cluster.
 */
export async function createCluster(
  baseUrl: string,
  params: { name: string; directories?: string[] },
): Promise<ApiResult<ClusterDefinition>> {
  return apiCall<ClusterDefinition>(`${baseUrl}/api/clusters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

/**
 * Update an existing cluster.
 */
export async function editCluster(
  baseUrl: string,
  id: string,
  updates: { name?: string; directories?: string[] },
): Promise<ApiResult<ClusterDefinition>> {
  return apiCall<ClusterDefinition>(`${baseUrl}/api/clusters/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

/**
 * Delete a cluster by ID.
 */
export async function deleteCluster(
  baseUrl: string,
  id: string,
): Promise<ApiResult<void>> {
  return apiCallVoid(`${baseUrl}/api/clusters/${id}`, {
    method: "DELETE",
  });
}

/**
 * Reorder clusters.
 */
export async function reorderClusters(
  baseUrl: string,
  orderedIds: string[],
): Promise<ApiResult<void>> {
  return apiCallVoid(`${baseUrl}/api/clusters/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedIds }),
  });
}

/**
 * Assign a session to a cluster (or null for unclustered).
 */
export async function assignSession(
  baseUrl: string,
  sessionId: string,
  clusterId: string | null,
): Promise<ApiResult<void>> {
  return apiCallVoid(`${baseUrl}/api/clusters/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, clusterId }),
  });
}
