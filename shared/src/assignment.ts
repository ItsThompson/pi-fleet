import type { ClusterConfig } from "./types/cluster.js";

export interface AssignmentResult {
	clusterId: string | null;
	reason: "manual" | "directory" | "none";
}

/**
 * Expands leading `~` in a path to the provided home directory.
 *
 * Accepts homedir as a parameter (not read from environment) so it remains
 * testable and platform-agnostic.
 *
 * Client consumers will resolve homedir via one of:
 * (a) Electron preload bridge exposing process.env.HOME
 * (b) inferHomedir(cwd) parsed from a known session cwd
 * Either approach works; the key constraint is parity with the server.
 */
export function expandTilde(path: string, homedir: string): string {
	if (path.startsWith("~/") || path === "~") {
		return homedir + path.slice(1);
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
 * Infer the home directory from a cwd path.
 *
 * On macOS, paths follow /Users/<username>/...
 * On Linux, paths follow /home/<username>/...
 *
 * Returns empty string if detection fails (disables tilde expansion).
 */
export function inferHomedir(cwd: string): string {
	// macOS: /Users/<username>
	const macMatch = cwd.match(/^(\/Users\/[^/]+)/);
	if (macMatch) {
		return macMatch[1];
	}

	// Linux: /home/<username>
	const linuxMatch = cwd.match(/^(\/home\/[^/]+)/);
	if (linuxMatch) {
		return linuxMatch[1];
	}

	// Root user on Linux
	if (cwd === "/root" || cwd.startsWith("/root/")) {
		return "/root";
	}

	return "";
}

/**
 * Pure function: determines which cluster a session belongs to.
 *
 * Priority:
 * 1. Manual override (sessionId in manualAssignments map)
 * 2. Directory prefix match (longest prefix wins)
 * 3. null (unclustered)
 *
 * No side effects. No I/O. Deterministic given the same inputs.
 *
 * @param sessionId - The session identifier to assign
 * @param cwd - The session's current working directory
 * @param config - Cluster configuration including definitions and manual assignments
 * @param homedir - The user's home directory for tilde expansion
 */
export function assignSessionToCluster(
	sessionId: string,
	cwd: string,
	config: ClusterConfig,
	homedir: string,
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
	const expandedCwd = normalizeTrailingSlash(expandTilde(cwd, homedir));
	let bestClusterId: string | null = null;
	let bestLength = 0;

	config.clusters.forEach((cluster) => {
		cluster.directories.forEach((dir) => {
			const expandedDir = normalizeTrailingSlash(expandTilde(dir, homedir));
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
