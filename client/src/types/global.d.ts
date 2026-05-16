import type { PiFleetBridge } from "@pi-fleet/shared";

declare global {
	interface Window {
		piFleet?: PiFleetBridge;
	}
}
