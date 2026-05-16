import type {
	RegisteredSession,
	RegisterBody,
	HeartbeatBody,
} from "@pi-fleet/shared";
import { REAP_TIMEOUT_MS } from "@pi-fleet/shared";

export type SessionEvent =
	| { type: "session:added"; session: RegisteredSession }
	| { type: "session:updated"; session: RegisteredSession }
	| { type: "session:removed"; sessionId: string };

export type SessionEventListener = (event: SessionEvent) => void;

export interface SessionRegistryDeps {
	/** Injectable clock for testability */
	now?: () => number;
	/** Reap timeout override (defaults to REAP_TIMEOUT_MS) */
	reapTimeoutMs?: number;
}

/**
 * In-memory session store with change events.
 * Tracks registered sessions, handles heartbeat merges, and reaps stale sessions.
 */
export class SessionRegistry {
	private sessions = new Map<string, RegisteredSession>();
	private listeners: SessionEventListener[] = [];
	private reapTimer: ReturnType<typeof setInterval> | undefined;
	private readonly now: () => number;
	private readonly reapTimeoutMs: number;

	constructor(deps: SessionRegistryDeps = {}) {
		this.now = deps.now ?? Date.now;
		this.reapTimeoutMs = deps.reapTimeoutMs ?? REAP_TIMEOUT_MS;
	}

	onEvent(listener: SessionEventListener): () => void {
		this.listeners.push(listener);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== listener);
		};
	}

	private emit(event: SessionEvent): void {
		this.listeners.forEach((listener) => listener(event));
	}

	register(body: RegisterBody): RegisteredSession {
		const now = new Date(this.now()).toISOString();
		const session: RegisteredSession = {
			sessionId: body.sessionId,
			pid: body.pid,
			cwd: body.cwd,
			tmuxTarget: body.tmuxTarget,
			startTime: body.startTime,
			activity: "idle",
			lastSeen: now,
			lastEventTime: body.startTime,
			agentName: body.agentName,
			subagentId: body.subagentId,
			model: body.model,
			contextUsage: body.contextUsage,
			thinkingLevel: body.thinkingLevel,
		};

		// If session already exists, treat as re-register (update in place)
		const existing = this.sessions.get(body.sessionId);
		if (existing) {
			this.sessions.set(body.sessionId, session);
			this.emit({ type: "session:updated", session });
			return session;
		}

		this.sessions.set(body.sessionId, session);
		this.emit({ type: "session:added", session });
		return session;
	}

	heartbeat(body: HeartbeatBody): RegisteredSession | undefined {
		const existing = this.sessions.get(body.sessionId);
		if (!existing) return undefined;

		const now = new Date(this.now()).toISOString();

		existing.activity = body.activity;
		existing.lastSeen = now;
		existing.lastEventTime = body.lastEventTime;

		if (body.tmuxTarget !== undefined) existing.tmuxTarget = body.tmuxTarget;
		if (body.agentName !== undefined) existing.agentName = body.agentName;
		if (body.model !== undefined) existing.model = body.model;
		if (body.contextUsage !== undefined)
			existing.contextUsage = body.contextUsage;
		if (body.turnCount !== undefined) existing.turnCount = body.turnCount;
		if (body.thinkingLevel !== undefined)
			existing.thinkingLevel = body.thinkingLevel;
		if (body.lastToolName !== undefined)
			existing.lastToolName = body.lastToolName;

		this.emit({ type: "session:updated", session: existing });
		return existing;
	}

	unregister(sessionId: string): boolean {
		const existed = this.sessions.delete(sessionId);
		if (existed) {
			this.emit({ type: "session:removed", sessionId });
		}
		return existed;
	}

	get(sessionId: string): RegisteredSession | undefined {
		return this.sessions.get(sessionId);
	}

	getAll(): RegisteredSession[] {
		return [...this.sessions.values()];
	}

	get size(): number {
		return this.sessions.size;
	}

	/**
	 * Scan for stale sessions and remove them.
	 * A session is stale if its lastSeen timestamp is older than reapTimeoutMs.
	 */
	reap(): string[] {
		const cutoff = this.now() - this.reapTimeoutMs;
		const reaped: string[] = [];

		this.sessions.forEach((session, sessionId) => {
			const lastSeenMs = new Date(session.lastSeen).getTime();
			if (lastSeenMs < cutoff) {
				this.sessions.delete(sessionId);
				reaped.push(sessionId);
				this.emit({ type: "session:removed", sessionId });
			}
		});

		return reaped;
	}

	startReaper(intervalMs: number = 5000): void {
		this.stopReaper();
		this.reapTimer = setInterval(() => this.reap(), intervalMs);
		// Unref so the timer doesn't prevent process exit
		this.reapTimer.unref();
	}

	stopReaper(): void {
		if (this.reapTimer) {
			clearInterval(this.reapTimer);
			this.reapTimer = undefined;
		}
	}

	dispose(): void {
		this.stopReaper();
		this.sessions.clear();
		this.listeners = [];
	}
}
