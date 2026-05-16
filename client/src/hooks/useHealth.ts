import { useState, useEffect } from "react";
import { getServerUrl } from "@/lib/bridge";

export interface HealthData {
	status: string;
	uptime: number;
	sessions: number;
	pods: number;
	version: string;
	piWatchDetected: boolean;
}

/**
 * Fetches server health data once on mount.
 * Used to detect pi-watch conflict and display warnings.
 */
export function useHealth(): HealthData | null {
	const [health, setHealth] = useState<HealthData | null>(null);

	useEffect(() => {
		const baseUrl = getServerUrl();
		fetch(`${baseUrl}/api/health`)
			.then((res) => {
				if (!res.ok) return null;
				return res.json();
			})
			.then((data) => {
				if (data) setHealth(data);
			})
			.catch(() => {
				// Non-critical: ignore errors
			});
	}, []);

	return health;
}
