import { homedir } from "node:os";
import {
	assignSessionToCluster as sharedAssignSessionToCluster,
	expandTilde as sharedExpandTilde,
	normalizeTrailingSlash,
} from "@pi-fleet/shared";
import type { AssignmentResult } from "@pi-fleet/shared";
import type { ClusterConfig } from "@pi-fleet/shared";

export type { AssignmentResult };

/**
 * Server adapter: expands tilde using os.homedir().
 */
export function expandTilde(path: string): string {
	return sharedExpandTilde(path, homedir());
}

export { normalizeTrailingSlash };

/**
 * Server adapter: delegates to the shared pure function, passing os.homedir().
 *
 * This preserves the existing server call signature (no homedir parameter)
 * while the core logic lives in @pi-fleet/shared.
 */
export function assignSessionToCluster(
	sessionId: string,
	cwd: string,
	config: ClusterConfig,
): AssignmentResult {
	return sharedAssignSessionToCluster(sessionId, cwd, config, homedir());
}
