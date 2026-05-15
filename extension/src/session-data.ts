import type { ContextUsagePayload, HeartbeatBody } from "@pi-fleet/shared";

export interface SessionData {
  model: string | null;
  contextUsage: ContextUsagePayload | null;
  turnCount: number;
  thinkingLevel: string;
  lastToolName: string | null;
}

export interface SessionDataCollector extends SessionData {
  /** Get current data snapshot for heartbeat payload. */
  snapshot(): Partial<HeartbeatBody>;
  /** Update model on model_select event. */
  onModelSelect(modelName: string): void;
  /** Increment turn count on turn_start. */
  onTurnStart(): void;
  /** Update last tool name on tool_execution_end. */
  onToolExecutionEnd(toolName: string): void;
  /** Update thinking level. */
  onThinkingLevelSelect(level: string): void;
  /** Update context usage (called at heartbeat time). */
  updateContextUsage(usage: ContextUsagePayload | null): void;
}

export function createSessionDataCollector(): SessionDataCollector {
  const data: SessionData = {
    model: null,
    contextUsage: null,
    turnCount: 0,
    thinkingLevel: "off",
    lastToolName: null,
  };

  return {
    get model() {
      return data.model;
    },
    get contextUsage() {
      return data.contextUsage;
    },
    get turnCount() {
      return data.turnCount;
    },
    get thinkingLevel() {
      return data.thinkingLevel;
    },
    get lastToolName() {
      return data.lastToolName;
    },

    onModelSelect(modelName: string) {
      data.model = modelName;
    },

    onTurnStart() {
      data.turnCount++;
    },

    onToolExecutionEnd(toolName: string) {
      data.lastToolName = toolName;
    },

    onThinkingLevelSelect(level: string) {
      data.thinkingLevel = level;
    },

    updateContextUsage(usage: ContextUsagePayload | null) {
      data.contextUsage = usage;
    },

    snapshot(): Partial<HeartbeatBody> {
      return {
        model: data.model ?? undefined,
        contextUsage: data.contextUsage ?? undefined,
        turnCount: data.turnCount,
        thinkingLevel: data.thinkingLevel,
        lastToolName: data.lastToolName ?? undefined,
      };
    },
  };
}
