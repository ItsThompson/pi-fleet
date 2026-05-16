import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import piFleetExtension from "./index.js";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// Mock execFile to prevent actual subprocess spawning
vi.mock("node:child_process", () => ({
  execFile: vi.fn(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string) => void,
    ) => {
      cb(null, "main:1.0\n");
    },
  ),
}));

// Mock fetch globally
const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
vi.stubGlobal("fetch", mockFetch);

type HandlerMap = Map<string, Array<(...args: unknown[]) => unknown>>;

function buildMockPi() {
  const handlers: HandlerMap = new Map();
  const eventHandlers: HandlerMap = new Map();

  const pi: ExtensionAPI = {
    on(event: string, handler: (...args: unknown[]) => unknown) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    events: {
      on(event: string, handler: (...args: unknown[]) => unknown) {
        const list = eventHandlers.get(event) ?? [];
        list.push(handler);
        eventHandlers.set(event, list);
      },
      emit: vi.fn(),
      off() {},
      removeAllListeners() {},
    },
    getSessionName: () => "test-session",
    getThinkingLevel: () => "medium",
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    registerShortcut: vi.fn(),
    registerFlag: vi.fn(),
    getFlag: vi.fn(),
    registerMessageRenderer: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    appendEntry: vi.fn(),
    setSessionName: vi.fn(),
    setLabel: vi.fn(),
    exec: vi.fn(),
    getActiveTools: vi.fn(),
    getAllTools: vi.fn(),
    setActiveTools: vi.fn(),
    getCommands: vi.fn(),
    setModel: vi.fn(),
    setThinkingLevel: vi.fn(),
    registerProvider: vi.fn(),
    unregisterProvider: vi.fn(),
  } as unknown as ExtensionAPI;

  return { pi, handlers, eventHandlers };
}

function buildMockCtx(overrides?: Partial<ExtensionContext>): ExtensionContext {
  return {
    cwd: "/test/project",
    sessionManager: {
      getSessionId: () => "test-session-id",
    },
    model: { name: "Claude Sonnet 4" },
    getContextUsage: () => ({
      tokens: 5000,
      contextWindow: 200000,
      percent: 2.5,
    }),
    ...overrides,
  } as unknown as ExtensionContext;
}

describe("piFleetExtension (index.ts wiring)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockClear();
    process.env.TMUX = "/tmp/tmux-501/default,123,0";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TMUX;
    delete process.env.SUBAGENT_ID;
  });

  it("registers lifecycle event handlers", () => {
    const { pi, handlers } = buildMockPi();
    piFleetExtension(pi);

    expect(handlers.has("session_start")).toBe(true);
    expect(handlers.has("session_shutdown")).toBe(true);
    expect(handlers.has("turn_start")).toBe(true);
    expect(handlers.has("turn_end")).toBe(true);
    expect(handlers.has("tool_execution_start")).toBe(true);
    expect(handlers.has("tool_execution_end")).toBe(true);
    expect(handlers.has("model_select")).toBe(true);
    expect(handlers.has("thinking_level_select")).toBe(true);
  });

  it("registers permission event handlers on event bus", () => {
    const { pi, eventHandlers } = buildMockPi();
    piFleetExtension(pi);

    expect(eventHandlers.has("pi-fleet:permission-requested")).toBe(true);
    expect(eventHandlers.has("pi-fleet:permission-granted")).toBe(true);
    expect(eventHandlers.has("pi-fleet:permission-denied")).toBe(true);
  });

  it("on session_start: calls register with correct payload", async () => {
    process.env.SUBAGENT_ID = "sub-123";
    const { pi, handlers } = buildMockPi();
    piFleetExtension(pi);

    const sessionStartHandler = handlers.get("session_start")![0] as (
      event: unknown,
      ctx: ExtensionContext,
    ) => Promise<void>;
    await sessionStartHandler({ type: "session_start", reason: "startup" }, buildMockCtx());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8314/api/sessions/register");

    const body = JSON.parse(opts.body);
    expect(body.sessionId).toBe("test-session-id");
    expect(body.pid).toBe(process.pid);
    expect(body.cwd).toBe("/test/project");
    expect(body.tmuxTarget).toBe("main:1.0");
    expect(body.agentName).toBe("test-session");
    expect(body.subagentId).toBe("sub-123");
    expect(body.model).toBe("Claude Sonnet 4");
    expect(body.thinkingLevel).toBe("medium");
  });

  it("on session_start: includes contextUsage", async () => {
    const { pi, handlers } = buildMockPi();
    piFleetExtension(pi);

    const handler = handlers.get("session_start")![0] as (
      event: unknown,
      ctx: ExtensionContext,
    ) => Promise<void>;
    await handler({ type: "session_start", reason: "startup" }, buildMockCtx());

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contextUsage).toEqual({
      tokens: 5000,
      contextWindow: 200000,
      percent: 3, // Math.round(2.5) = 3
    });
  });

  it("on session_start: tmuxTarget is null when TMUX env is unset", async () => {
    delete process.env.TMUX;
    const { pi, handlers } = buildMockPi();
    piFleetExtension(pi);

    const handler = handlers.get("session_start")![0] as (
      event: unknown,
      ctx: ExtensionContext,
    ) => Promise<void>;
    await handler({ type: "session_start", reason: "startup" }, buildMockCtx());

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.tmuxTarget).toBeNull();
  });

  it("on session_shutdown: stops heartbeats and unregisters", async () => {
    const { pi, handlers } = buildMockPi();
    piFleetExtension(pi);

    // First start session to set sessionId
    const startHandler = handlers.get("session_start")![0] as (
      event: unknown,
      ctx: ExtensionContext,
    ) => Promise<void>;
    await startHandler({ type: "session_start", reason: "startup" }, buildMockCtx());
    mockFetch.mockClear();

    // Then shutdown
    const shutdownHandler = handlers.get("session_shutdown")![0] as (
      event: unknown,
      ctx: ExtensionContext,
    ) => Promise<void>;
    await shutdownHandler({ type: "session_shutdown", reason: "quit" }, buildMockCtx());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "http://127.0.0.1:8314/api/sessions/test-session-id/unregister",
    );
  });

  it("on tool_execution_end: tracks tool name in data collector", async () => {
    const { pi, handlers } = buildMockPi();
    piFleetExtension(pi);

    // Start session first
    const startHandler = handlers.get("session_start")![0] as (
      event: unknown,
      ctx: ExtensionContext,
    ) => Promise<void>;
    await startHandler({ type: "session_start", reason: "startup" }, buildMockCtx());
    mockFetch.mockClear();

    // Fire tool_execution_end
    const toolEndHandler = handlers.get("tool_execution_end")![0] as (
      event: { toolName: string },
      ctx: ExtensionContext,
    ) => Promise<void>;
    await toolEndHandler(
      { toolName: "bash", toolCallId: "tc1", result: {}, isError: false } as unknown as { toolName: string },
      buildMockCtx(),
    );

    // Trigger heartbeat to verify data flows through
    await vi.advanceTimersByTimeAsync(5000);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.lastToolName).toBe("bash");
  });

  it("on model_select: tracks model name", async () => {
    const { pi, handlers } = buildMockPi();
    piFleetExtension(pi);

    // Start session
    const startHandler = handlers.get("session_start")![0] as (
      event: unknown,
      ctx: ExtensionContext,
    ) => Promise<void>;
    await startHandler({ type: "session_start", reason: "startup" }, buildMockCtx());
    mockFetch.mockClear();

    // Fire model_select
    const modelHandler = handlers.get("model_select")![0] as (
      event: { model: { name: string } },
      ctx: ExtensionContext,
    ) => Promise<void>;
    await modelHandler(
      { model: { name: "Claude Opus 4" } } as unknown as { model: { name: string } },
      buildMockCtx(),
    );

    // Trigger heartbeat
    await vi.advanceTimersByTimeAsync(5000);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("Claude Opus 4");
  });

  it("heartbeat includes turnCount from data collector", async () => {
    const { pi, handlers } = buildMockPi();
    piFleetExtension(pi);

    // Start session
    const startHandler = handlers.get("session_start")![0] as (
      event: unknown,
      ctx: ExtensionContext,
    ) => Promise<void>;
    await startHandler({ type: "session_start", reason: "startup" }, buildMockCtx());
    mockFetch.mockClear();

    // Fire 3 turn_starts
    const turnStartHandler = handlers.get("turn_start")![0] as (
      event: unknown,
      ctx: ExtensionContext,
    ) => Promise<void>;
    await turnStartHandler({ type: "turn_start", turnIndex: 0, timestamp: 0 }, buildMockCtx());
    await turnStartHandler({ type: "turn_start", turnIndex: 1, timestamp: 0 }, buildMockCtx());
    await turnStartHandler({ type: "turn_start", turnIndex: 2, timestamp: 0 }, buildMockCtx());

    // Trigger heartbeat
    await vi.advanceTimersByTimeAsync(5000);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.turnCount).toBe(3);
  });

  it("re-reports pod ownership after server restart re-registration", async () => {
    const emitSpy = vi.fn();
    const { pi, handlers } = buildMockPi();
    (pi.events as { emit: typeof emitSpy }).emit = emitSpy;
    piFleetExtension(pi);

    // Start session (triggers register + requestInitialState)
    const startHandler = handlers.get("session_start")![0] as (
      event: unknown,
      ctx: ExtensionContext,
    ) => Promise<void>;
    await startHandler({ type: "session_start", reason: "startup" }, buildMockCtx());

    // Verify initial requestInitialState emitted
    const initialRequests = emitSpy.mock.calls.filter(
      (call: unknown[]) => call[0] === "pi-fleet:request-subagent-registry",
    );
    expect(initialRequests).toHaveLength(1);

    // Simulate server restart: heartbeat returns 404
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    // Then re-register succeeds
    mockFetch.mockResolvedValueOnce({ ok: true, status: 201 });

    await vi.advanceTimersByTimeAsync(5000);

    // After re-registration, should re-request subagent registry
    const allRequests = emitSpy.mock.calls.filter(
      (call: unknown[]) => call[0] === "pi-fleet:request-subagent-registry",
    );
    expect(allRequests.length).toBeGreaterThan(1);
  });
});
