/**
 * Secondary entry point for test consumers only.
 * Not imported by production code.
 */

export { SessionRegistry } from "./session-registry.js";
export type { SessionEvent, SessionEventListener } from "./session-registry.js";
export { PodRegistry } from "./pod-registry.js";
export type { PodEvent, PodEventListener } from "./pod-registry.js";
export { EventBus } from "./event-bus.js";
export type { SSEClient } from "./event-bus.js";
export {
	registerBodySchema,
	heartbeatBodySchema,
	ownershipBodySchema,
	openTerminalBodySchema,
} from "./schemas.js";
