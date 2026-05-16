/**
 * Possible activity states for a pi session.
 * Ordered from lowest to highest priority for aggregation.
 *
 * String union (not enum) for better tree-shaking and Zod inference.
 */
export type ActivityStatus =
	| "processing"
	| "running_tool"
	| "idle"
	| "pending_approval";

export interface ContextUsagePayload {
	/** Tokens used, or null if unknown (e.g., before first LLM call) */
	tokens: number | null;
	/** Total context window size */
	contextWindow: number;
	/** Percentage as integer 0-100, or null if tokens unknown */
	percent: number | null;
}

export interface RegisterBody {
	sessionId: string;
	pid: number;
	cwd: string;
	tmuxTarget: string | null;
	/** ISO 8601 timestamp */
	startTime: string;
	agentName?: string;
	/** process.env.SUBAGENT_ID for pod correlation */
	subagentId?: string;
	/** Current model display name (e.g., "Claude Sonnet 4") */
	model?: string;
	/** Initial context state */
	contextUsage?: ContextUsagePayload;
	/** "off" | "low" | "medium" | "high" */
	thinkingLevel?: string;
}

export interface HeartbeatBody {
	sessionId: string;
	activity: ActivityStatus;
	lastEventTime: string;
	tmuxTarget?: string | null;
	agentName?: string;
	/** Updated on model_select event */
	model?: string;
	/** Updated each heartbeat */
	contextUsage?: ContextUsagePayload;
	/** Cumulative turn count this session */
	turnCount?: number;
	/** Updated on change */
	thinkingLevel?: string;
	/** Most recent tool executed */
	lastToolName?: string;
}

export interface RegisteredSession {
	sessionId: string;
	pid: number;
	cwd: string;
	tmuxTarget: string | null;
	startTime: string;
	activity: ActivityStatus;
	lastSeen: string;
	lastEventTime: string;
	agentName?: string;
	subagentId?: string;
	model?: string;
	contextUsage?: ContextUsagePayload;
	turnCount?: number;
	thinkingLevel?: string;
	lastToolName?: string;
}
