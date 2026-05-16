# 10: Non-Functional Requirements

## Window Dimensions

| Property | Value | Rationale |
|----------|-------|----------|
| Default width | 420px | Fits 2-column card grid with padding; similar to Slack sidebar |
| Default height | 680px | Shows ~6 cards without scrolling; fits most displays |
| Min width | 360px | Single-column card layout minimum |
| Min height | 400px | Header + sidebar + at least 3 cards visible |
| Max width | 600px | Menu-bar overlay shouldn't dominate screen |
| Max height | 900px | Capped to avoid covering full screen |
| Position | Anchored to menu-bar icon (top-right on macOS) | Standard menu-bar app pattern |
| Resize | Vertically resizable by dragging bottom edge | User controls visible area |

The overlay is NOT a full desktop window. It appears/disappears on F5 or tray click, anchored near the menu bar. Think: 1Password popup, or macOS Notification Center.

## Performance

| Metric | Target | Rationale |
|--------|--------|-----------|
| SSE event delivery latency | < 100ms from registry change to client render | Real-time feel for state transitions |
| Terminal opener total time | < 500ms from click to terminal foreground | Faster than manual alt-tab + tmux prefix |
| Heartbeat processing | < 5ms per heartbeat on server | Must handle 20+ sessions at 5s intervals |
| UI re-render on state change | < 16ms (60fps) | No jank when badges/filters update |
| Pod computation | < 10ms for 50 sessions | Recomputed on every ownership report or session change |
| Cluster assignment | < 1ms per session | Simple prefix matching, no I/O |
| Config file write | Debounced 500ms | Avoid disk thrash on rapid reorder/assignment changes |
| App startup to first render | < 2s | Server start + window create + initial fetch |
| Memory usage (idle, 20 sessions) | < 100MB RSS | Electron baseline ~80MB; data structures are small |

## Security

| Concern | Mitigation |
|---------|-----------|
| Server bound to localhost only | Fastify listens on `127.0.0.1:8314`; no external access |
| No authentication on API | Acceptable: localhost-only, single-user machine |
| Config file permissions | Created with 0600 (owner read/write only) |
| Electron context isolation | `contextIsolation: true`, `nodeIntegration: false` in BrowserWindow |
| Preload script | Minimal surface: only exposes `piFleet.*` methods via contextBridge |
| osascript injection | Terminal app name is validated against allowlist before interpolation |
| tmux command injection | All tmux args passed as array (no shell interpolation) |
| Extension trust | pi-fleet extension runs in same process as pi: same trust model as all extensions |

## Error Handling

### Operations → Error States

| Operation | Loading State | Error State | Recovery |
|-----------|--------------|-------------|----------|
| SSE connection | "Connecting..." indicator | Auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s) | Successful reconnect clears error; full session refetch on reconnect |
| Session registration (extension) | N/A (fire-and-forget) | Heartbeat client tracks failure count; backs off after 3 failures | Resumes normal interval after success |
| Terminal open | Brief loading state on button | Notification with specific reason | User retries manually |
| Cluster config load | App starts with empty clusters | Log error, use defaults | User can recreate clusters; config is human-editable JSON |
| Cluster config save | N/A (background) | Retry once; log if still failing | Data loss limited to most recent change |
| Pod ownership report | N/A (extension → server) | Silently retry on next `registry-updated` signal | Pods render as single-member until successful |
| Inter-extension protocol (no orchestrator) | N/A | Graceful degradation: all pods are single-member | Feature works normally once orchestrator is available |

### Server Error Responses

| Status | Meaning | Client Behavior |
|--------|---------|----------------|
| 400 | Validation failed (bad payload) | Log warning; do not retry (bug in extension) |
| 404 | Session not found | Expected during race conditions; ignore |
| 500 | Internal server error | Log error; retry on next heartbeat |

## Observability

### Structured Logging (Server)

All server logs are JSON objects with:
```typescript
interface LogEntry {
  timestamp: string;    // ISO 8601
  event: string;        // snake_case event name
  [key: string]: unknown;  // Additional context
}
```

Key events logged:
- `server_started`, `server_stopped`
- `session_registered`, `session_reaped`, `session_unregistered`
- `pod_formed`, `pod_dissolved`, `ownership_reported`
- `cluster_created`, `cluster_deleted`, `assignment_changed`
- `terminal_open_success`, `terminal_open_failure`
- `config_load_error`, `config_save_error`

### Log Location

`~/Library/Logs/PiFleet/pi-fleet.log` (standard macOS log location for apps).

### Client-Side

- Console warnings for SSE reconnection events
- Console errors for failed API calls
- No user-facing error toasts for transient issues (SSE reconnect, heartbeat failures)

## Backwards Compatibility

| Concern | Strategy |
|---------|----------|
| pi-watch extension still running | pi-fleet server accepts pi-watch payloads (all new fields are optional) |
| Both pi-watch and pi-fleet running | Different ports or same port (only one can bind 8314). Decision: pi-fleet uses same port. Users must choose one. |
| Config file migration | No migration needed: pi-fleet creates its own config in `PiFleet/` not `PiWatch/` |
| Extension migration | Users manually switch: remove pi-watch extension symlink, install pi-fleet extension |

## Resource Constraints

| Resource | Limit | Enforcement |
|----------|-------|-------------|
| Max sessions displayed | Unlimited (scrollable) | pi-watch had MAX_VISIBLE_SESSIONS=5; pi-fleet removes this limit |
| Max clusters | No hard limit | UI may become unwieldy past ~20, but no enforcement |
| Max pods per cluster | No hard limit | Card grid scrolls |
| SSE connections | 1 per client window | Single BrowserWindow design |
| Heartbeat interval | 5 seconds | Unchanged from pi-watch |
| Session expiry (reap) | 15 seconds without heartbeat | Unchanged from pi-watch |
