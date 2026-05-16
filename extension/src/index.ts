import type {
  ExtensionAPI,
  ExtensionContext,
  ContextUsage,
} from "@mariozechner/pi-coding-agent";
import type { ContextUsagePayload, HeartbeatBody, RegisterBody } from "@pi-fleet/shared";
import { createActivityTracker } from "./activity-tracker.js";
import { createHeartbeatClient } from "./heartbeat-client.js";
import { createSessionDataCollector } from "./session-data.js";
import { createPodReporter } from "./pod-reporter.js";
import { captureTmuxTarget, type Exec } from "./tmux-target.js";
import { execFile } from "node:child_process";

const LOG_PREFIX = "[pi-fleet]";

const exec: Exec = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (error, stdout) => {
      resolve({ stdout: stdout ?? "", code: error ? 1 : 0 });
    });
  });

function toContextUsagePayload(
  usage: ContextUsage | undefined,
): ContextUsagePayload | undefined {
  if (!usage) return undefined;
  return {
    tokens: usage.tokens,
    contextWindow: usage.contextWindow,
    percent: usage.percent !== null ? Math.round(usage.percent) : null,
  };
}

export default function piFleetExtension(pi: ExtensionAPI): void {
  let registerBody: RegisterBody | undefined;

  const tracker = createActivityTracker();
  const client = createHeartbeatClient({
    onSessionNotFound: () => {
      registered = false;
    },
    onReregister: async () => {
      if (registerBody) {
        registered = await client.register(registerBody);
      }
      return registered;
    },
  });
  const dataCollector = createSessionDataCollector();

  let registered = false;
  let sessionId: string | undefined;
  let extensionCtx: ExtensionContext | undefined;
  let lastKnownTmuxTarget: string | null = null;

  // --- Session lifecycle ---

  pi.on("session_start", async (_event, ctx) => {
    try {
      extensionCtx = ctx;
      sessionId = ctx.sessionManager.getSessionId();
      const cwd = ctx.cwd;

      // Capture tmux target
      const tmux = await captureTmuxTarget(process.env, exec);
      lastKnownTmuxTarget = tmux?.target ?? null;

      // Gather initial data
      const model = ctx.model?.name ?? undefined;
      if (model) dataCollector.onModelSelect(model);

      const thinkingLevel = pi.getThinkingLevel();
      dataCollector.onThinkingLevelSelect(thinkingLevel);

      const contextUsage = toContextUsagePayload(ctx.getContextUsage());

      registerBody = {
        sessionId,
        pid: process.pid,
        cwd,
        tmuxTarget: lastKnownTmuxTarget,
        startTime: new Date().toISOString(),
        agentName: pi.getSessionName() ?? undefined,
        subagentId: process.env.SUBAGENT_ID ?? undefined,
        model,
        contextUsage,
        thinkingLevel,
      };

      registered = await client.register(registerBody);

      // Start heartbeat loop (retries registration if server wasn't available)
      client.startHeartbeats(async (): Promise<HeartbeatBody> => {
        // Retry registration until it succeeds
        if (!registered && registerBody) {
          registered = await client.register(registerBody);
        }

        // Refresh tmux target each heartbeat
        const freshTmux = await captureTmuxTarget(process.env, exec);
        if (freshTmux) lastKnownTmuxTarget = freshTmux.target;

        // Read context usage at heartbeat time
        const currentUsage = toContextUsagePayload(
          extensionCtx?.getContextUsage(),
        );
        dataCollector.updateContextUsage(currentUsage ?? null);

        return {
          sessionId: sessionId!,
          ...tracker.snapshot(),
          tmuxTarget: lastKnownTmuxTarget,
          agentName: pi.getSessionName() ?? undefined,
          ...dataCollector.snapshot(),
        };
      });

      // Start pod reporter: inter-extension protocol for ownership reporting
      const podReporter = createPodReporter({
        events: pi.events,
        sessionId,
      });
      podReporter.requestInitialState();
    } catch (err) {
      console.error(LOG_PREFIX, "session_start error:", err);
    }
  });

  pi.on("session_shutdown", async () => {
    try {
      client.stopHeartbeats();
      if (sessionId) await client.unregister(sessionId);
    } catch (err) {
      console.error(LOG_PREFIX, "session_shutdown error:", err);
    }
  });

  // --- Activity tracking ---

  pi.on("turn_start", async () => {
    try {
      tracker.onTurnStart();
      dataCollector.onTurnStart();
    } catch (err) {
      console.error(LOG_PREFIX, "turn_start error:", err);
    }
  });

  pi.on("turn_end", async () => {
    try {
      tracker.onTurnEnd();
    } catch (err) {
      console.error(LOG_PREFIX, "turn_end error:", err);
    }
  });

  pi.on("tool_execution_start", async () => {
    try {
      tracker.onToolExecutionStart();
    } catch (err) {
      console.error(LOG_PREFIX, "tool_execution_start error:", err);
    }
  });

  pi.on("tool_execution_end", async (event) => {
    try {
      tracker.onToolExecutionEnd();
      dataCollector.onToolExecutionEnd(event.toolName);
    } catch (err) {
      console.error(LOG_PREFIX, "tool_execution_end error:", err);
    }
  });

  // --- Data collection ---

  pi.on("model_select", async (event) => {
    try {
      dataCollector.onModelSelect(event.model.name);
    } catch (err) {
      console.error(LOG_PREFIX, "model_select error:", err);
    }
  });

  pi.on("thinking_level_select", async (event) => {
    try {
      dataCollector.onThinkingLevelSelect(event.level);
    } catch (err) {
      console.error(LOG_PREFIX, "thinking_level_select error:", err);
    }
  });

  // --- Permission events (inter-extension protocol) ---
  // These are custom events on the shared event bus.
  // They can be emitted by pi internals or other extensions.

  pi.events.on("pi-fleet:permission-requested", () => {
    try {
      tracker.onToolPermissionRequested();
    } catch (err) {
      console.error(LOG_PREFIX, "permission-requested error:", err);
    }
  });

  pi.events.on("pi-fleet:permission-granted", () => {
    try {
      tracker.onToolPermissionGranted();
    } catch (err) {
      console.error(LOG_PREFIX, "permission-granted error:", err);
    }
  });

  pi.events.on("pi-fleet:permission-denied", () => {
    try {
      tracker.onToolPermissionDenied();
    } catch (err) {
      console.error(LOG_PREFIX, "permission-denied error:", err);
    }
  });
}
