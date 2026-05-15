export interface PiFleetConfig {
  /** Schema version. Increment on breaking format changes. */
  version: 1;
  /** User preferences */
  preferences: {
    ghostMode: boolean;
    ghostOpacity: number;
    soundEnabled: boolean;
  };
}
