import { readFileSync, writeFileSync, mkdirSync, constants } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { ClusterConfig, ClusterDefinition } from "@pi-fleet/shared";
import {
	assignSessionToCluster,
	type AssignmentResult,
} from "./cluster-assignment.js";
import { log } from "./utils/logger.js";

const DEBOUNCE_MS = 500;
const FILE_PERMISSIONS = 0o600;

export interface ClusterStoreDeps {
	configPath: string;
	onChange: () => void;
}

export interface ClusterStore {
	getConfig(): ClusterConfig;
	getClusters(): ClusterDefinition[];

	createCluster(name: string, directories?: string[]): ClusterDefinition;
	updateCluster(
		id: string,
		updates: Partial<Pick<ClusterDefinition, "name" | "directories">>,
	): ClusterDefinition | undefined;
	deleteCluster(id: string): boolean;
	reorderClusters(orderedIds: string[]): void;

	setManualAssignment(sessionId: string, clusterId: string | null): void;
	getManualAssignment(sessionId: string): string | null;
	clearManualAssignment(sessionId: string): void;

	assignSession(sessionId: string, cwd: string): AssignmentResult;

	/** Flush any pending debounced writes immediately */
	flush(): void;
	/** Cleanup: flush + clear timers */
	dispose(): void;
}

function createDefaultConfig(): ClusterConfig {
	return {
		version: 1,
		clusters: [],
		manualAssignments: {},
	};
}

function loadConfig(configPath: string): ClusterConfig {
	try {
		const content = readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(content) as ClusterConfig;
		// Validate minimal structure
		if (!parsed.version || !Array.isArray(parsed.clusters)) {
			return createDefaultConfig();
		}
		return parsed;
	} catch {
		return createDefaultConfig();
	}
}

/**
 * Removes manual assignments that reference clusters that no longer exist.
 * Called on load to handle the case where a cluster was deleted externally.
 */
function cleanupOrphanAssignments(config: ClusterConfig): boolean {
	const clusterIds = new Set(config.clusters.map((cluster) => cluster.id));
	const orphans = Object.entries(config.manualAssignments).filter(
		([, clusterId]) => !clusterIds.has(clusterId),
	);

	if (orphans.length === 0) return false;

	orphans.forEach(([sessionId]) => {
		delete config.manualAssignments[sessionId];
	});

	log({
		timestamp: new Date().toISOString(),
		event: "cluster_orphans_cleaned",
		count: orphans.length,
	});

	return true;
}

export function createClusterStore(deps: ClusterStoreDeps): ClusterStore {
	const { configPath, onChange } = deps;
	let config = loadConfig(configPath);
	let dirty = false;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	// Run orphan cleanup on load
	if (cleanupOrphanAssignments(config)) {
		dirty = true;
		schedulePersist();
	}

	function schedulePersist(): void {
		if (debounceTimer) return; // Already scheduled
		dirty = true;
		debounceTimer = setTimeout(() => {
			debounceTimer = undefined;
			persistNow();
		}, DEBOUNCE_MS);
	}

	function persistNow(): void {
		if (!dirty) return;
		dirty = false;

		try {
			mkdirSync(dirname(configPath), { recursive: true });
			const content = JSON.stringify(config, null, 2);
			writeFileSync(configPath, content, { mode: FILE_PERMISSIONS });
		} catch (error) {
			log({
				timestamp: new Date().toISOString(),
				event: "cluster_config_write_failed",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	function flush(): void {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = undefined;
		}
		persistNow();
	}

	function dispose(): void {
		flush();
	}

	return {
		getConfig(): ClusterConfig {
			return config;
		},

		getClusters(): ClusterDefinition[] {
			return [...config.clusters].sort((a, b) => a.sortOrder - b.sortOrder);
		},

		createCluster(name: string, directories: string[] = []): ClusterDefinition {
			const cluster: ClusterDefinition = {
				id: randomUUID(),
				name,
				directories,
				sortOrder: config.clusters.length,
			};
			config.clusters.push(cluster);
			schedulePersist();
			onChange();
			return cluster;
		},

		updateCluster(
			id: string,
			updates: Partial<Pick<ClusterDefinition, "name" | "directories">>,
		): ClusterDefinition | undefined {
			const cluster = config.clusters.find((c) => c.id === id);
			if (!cluster) return undefined;

			if (updates.name !== undefined) cluster.name = updates.name;
			if (updates.directories !== undefined)
				cluster.directories = updates.directories;

			schedulePersist();
			onChange();
			return cluster;
		},

		deleteCluster(id: string): boolean {
			const index = config.clusters.findIndex((c) => c.id === id);
			if (index === -1) return false;

			config.clusters.splice(index, 1);

			// Clear manual assignments pointing to this cluster
			Object.entries(config.manualAssignments).forEach(
				([sessionId, clusterId]) => {
					if (clusterId === id) {
						delete config.manualAssignments[sessionId];
					}
				},
			);

			schedulePersist();
			onChange();
			return true;
		},

		reorderClusters(orderedIds: string[]): void {
			orderedIds.forEach((id, index) => {
				const cluster = config.clusters.find((c) => c.id === id);
				if (cluster) {
					cluster.sortOrder = index;
				}
			});
			schedulePersist();
			onChange();
		},

		setManualAssignment(sessionId: string, clusterId: string | null): void {
			if (clusterId === null) {
				delete config.manualAssignments[sessionId];
			} else {
				config.manualAssignments[sessionId] = clusterId;
			}
			schedulePersist();
			onChange();
		},

		getManualAssignment(sessionId: string): string | null {
			return config.manualAssignments[sessionId] ?? null;
		},

		clearManualAssignment(sessionId: string): void {
			delete config.manualAssignments[sessionId];
			schedulePersist();
			onChange();
		},

		assignSession(sessionId: string, cwd: string): AssignmentResult {
			return assignSessionToCluster(sessionId, cwd, config);
		},

		flush,
		dispose,
	};
}
