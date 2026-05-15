export interface ClusterDefinition {
  /** Stable UUID */
  id: string;
  /** User-visible name */
  name: string;
  /** Directories that auto-assign pods to this cluster (tilde-expanded) */
  directories: string[];
  /** Sort position (lower = higher in sidebar) */
  sortOrder: number;
}

export interface ClusterConfig {
  /** Schema version */
  version: 1;
  /** Ordered list of user-created clusters */
  clusters: ClusterDefinition[];
  /** Manual overrides: sessionId → clusterId */
  manualAssignments: Record<string, string>;
}
