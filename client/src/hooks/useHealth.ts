import { useState, useEffect } from "react";

export interface HealthData {
  status: string;
  uptime: number;
  sessions: number;
  pods: number;
  version: string;
  piWatchDetected: boolean;
}

function getBaseUrl(): string {
  if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).piFleet) {
    return (window as unknown as { piFleet: { getServerUrl: () => string } }).piFleet.getServerUrl();
  }
  return "";
}

/**
 * Fetches server health data once on mount.
 * Used to detect pi-watch conflict and display warnings.
 */
export function useHealth(): HealthData | null {
  const [health, setHealth] = useState<HealthData | null>(null);

  useEffect(() => {
    const baseUrl = getBaseUrl();
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
