import type { RegisterBody, HeartbeatBody, ActivityStatus } from "@pi-fleet/shared";
import { randomUUID } from "node:crypto";

export interface MockSessionOptions {
  sessionId?: string;
  pid?: number;
  cwd?: string;
  tmuxTarget?: string | null;
  agentName?: string;
  subagentId?: string;
  model?: string;
  thinkingLevel?: string;
}

/**
 * Creates a registration payload with sensible defaults.
 */
export function buildRegisterBody(options: MockSessionOptions = {}): RegisterBody {
  return {
    sessionId: options.sessionId ?? randomUUID(),
    pid: options.pid ?? Math.floor(Math.random() * 90000) + 10000,
    cwd: options.cwd ?? "/Users/test/project",
    tmuxTarget: options.tmuxTarget ?? "main:1.0",
    startTime: new Date().toISOString(),
    agentName: options.agentName,
    subagentId: options.subagentId,
    model: options.model ?? "Claude Sonnet 4",
    thinkingLevel: options.thinkingLevel,
  };
}

/**
 * Creates a heartbeat payload for an existing session.
 */
export function buildHeartbeatBody(
  sessionId: string,
  activity: ActivityStatus = "processing",
  overrides: Partial<HeartbeatBody> = {},
): HeartbeatBody {
  return {
    sessionId,
    activity,
    lastEventTime: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Simulates a mock pi session lifecycle against the server API.
 * Handles register + periodic heartbeats.
 */
export class MockSession {
  readonly sessionId: string;
  readonly registerBody: RegisterBody;
  private baseUrl: string;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private currentActivity: ActivityStatus = "processing";

  constructor(baseUrl: string, options: MockSessionOptions = {}) {
    this.registerBody = buildRegisterBody(options);
    this.sessionId = this.registerBody.sessionId;
    this.baseUrl = baseUrl;
  }

  async register(): Promise<Response> {
    return fetch(`${this.baseUrl}/api/sessions/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.registerBody),
    });
  }

  async heartbeat(
    activity?: ActivityStatus,
    overrides?: Partial<HeartbeatBody>,
  ): Promise<Response> {
    if (activity) {
      this.currentActivity = activity;
    }
    const body = buildHeartbeatBody(this.sessionId, this.currentActivity, overrides);
    return fetch(`${this.baseUrl}/api/sessions/${this.sessionId}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async unregister(): Promise<Response> {
    this.stopHeartbeat();
    return fetch(`${this.baseUrl}/api/sessions/${this.sessionId}/unregister`, {
      method: "POST",
    });
  }

  /**
   * Start periodic heartbeats (every intervalMs).
   */
  startHeartbeat(intervalMs: number = 1000): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.heartbeat().catch(() => {
        // Session may have been reaped
      });
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  setActivity(activity: ActivityStatus): void {
    this.currentActivity = activity;
  }
}
