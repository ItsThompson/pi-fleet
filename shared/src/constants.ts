/** Server listens on this port (127.0.0.1 only) */
export const SERVER_PORT = 8314;

/** Extension heartbeat interval in milliseconds */
export const HEARTBEAT_INTERVAL_MS = 5000;

/** Time after last heartbeat before a session is reaped (ms) */
export const REAP_TIMEOUT_MS = 15000;

/** SSE keep-alive interval in milliseconds */
export const SSE_KEEPALIVE_MS = 30000;

/** Sentinel ID for the unclustered pseudo-group */
export const UNCLUSTERED_ID = "unclustered";
