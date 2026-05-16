import { homedir } from "node:os";
import type { ClusterConfig } from "@pi-fleet/shared";

export interface AssignmentResult {
	clusterId: string | null;
	reason: "manual" | "directory" | "none";
}

/**
 * Expands leading `~` in a path to the user's home directory.
 */
export function expandTilde(path: string): string {
	if (path.startsWith("~/") || path === "~") {
		return homedir() + path.slice(1);
	}
	return path;
}

/**
 * Normalizes a path by ensuring it ends with a trailing slash.
 * This prevents partial directory name matches (e.g., /home/foo matching /home/foobar).
 */
export function normalizeTrailingSlash(path: string): string {
	return path.endsWith("/") ? path : path + "/";
}

/**
 * Determines which cluster a session belongs to based on:
 * 1. Manual override (highest priority)
 * 2. Directory prefix matching (longest prefix wins)
 * 3. Unclustered (null clusterId) if no match
 */
export function assignSessionToCluster(
	sessionId: string,
	cwd: string,
	config: ClusterConfig,
): AssignmentResult {
	// 1. Check manual override
	const manualClusterId = config.manualAssignments[sessionId];
	if (manualClusterId) {
		const clusterExists = config.clusters.some(
			(cluster) => cluster.id === manualClusterId,
		);
		if (clusterExists) {
			return { clusterId: manualClusterId, reason: "manual" };
		}
		// Manual assignment points to a deleted cluster: treat as no override
	}

	// 2. Directory prefix matching (longest prefix wins)
	const expandedCwd = normalizeTrailingSlash(expandTilde(cwd));
	let bestClusterId: string | null = null;
	let bestLength = 0;

	config.clusters.forEach((cluster) => {
		cluster.directories.forEach((dir) => {
			const expandedDir = normalizeTrailingSlash(expandTilde(dir));
			if (expandedCwd.startsWith(expandedDir)) {
				if (expandedDir.length > bestLength) {
					bestClusterId = cluster.id;
					bestLength = expandedDir.length;
				}
			}
		});
	});

	if (bestClusterId) {
		return { clusterId: bestClusterId, reason: "directory" };
	}

	// 3. No match
	return { clusterId: null, reason: "none" };
}
