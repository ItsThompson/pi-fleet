import { describe, it, expect, vi, beforeEach } from "vitest";
import { createEmbeddedServer } from "./server.js";

const mockDialog = {
  showMessageBox: vi.fn(),
  showErrorBox: vi.fn(),
};

const mockServerInstance = {
  start: vi.fn(),
  stop: vi.fn(),
  registry: { onEvent: vi.fn() },
  app: {},
};

const mockCreateServer = vi.fn(() => mockServerInstance);

vi.mock("electron", () => ({
  dialog: {
    showMessageBox: (...args: unknown[]) => mockDialog.showMessageBox(...(args as [unknown])),
    showErrorBox: (...args: unknown[]) => mockDialog.showErrorBox(...(args as [unknown, unknown])),
  },
}));

vi.mock("@pi-fleet/server", () => ({
  createServer: (...args: unknown[]) => mockCreateServer(...(args as [])),
}));

describe("createEmbeddedServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServerInstance.start.mockResolvedValue(undefined);
    mockServerInstance.stop.mockResolvedValue(undefined);
  });

  it("start() returns true on successful server start", async () => {
    const server = createEmbeddedServer();
    const result = await server.start();
    expect(result).toBe(true);
    expect(mockCreateServer).toHaveBeenCalledWith({
      port: 8314,
      host: "127.0.0.1",
    });
  });

  it("start() shows port conflict dialog on EADDRINUSE", async () => {
    mockServerInstance.start.mockRejectedValueOnce(
      new Error("Failed to start server on 127.0.0.1:8314: listen EADDRINUSE: address already in use"),
    );
    // User clicks "Quit"
    mockDialog.showMessageBox.mockResolvedValue({ response: 1 });

    const server = createEmbeddedServer();
    const result = await server.start();

    expect(result).toBe(false);
    expect(mockDialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Pi Fleet: Port Conflict",
        message: expect.stringContaining("8314"),
        detail: expect.stringContaining("pi-fleet or pi-watch"),
      }),
    );
  });

  it("start() retries on port conflict when user clicks Retry", async () => {
    // First attempt fails
    mockServerInstance.start
      .mockRejectedValueOnce(new Error("EADDRINUSE"))
      .mockResolvedValueOnce(undefined);

    // User clicks "Retry"
    mockDialog.showMessageBox.mockResolvedValue({ response: 0 });

    const server = createEmbeddedServer();
    const result = await server.start();

    expect(result).toBe(true);
    expect(mockCreateServer).toHaveBeenCalledTimes(2);
  });

  it("start() shows generic error for non-port failures", async () => {
    mockServerInstance.start.mockRejectedValue(new Error("Something else broke"));

    const server = createEmbeddedServer();
    const result = await server.start();

    expect(result).toBe(false);
    expect(mockDialog.showErrorBox).toHaveBeenCalledWith(
      "Pi Fleet: Server Error",
      expect.stringContaining("Something else broke"),
    );
  });

  it("stop() calls instance.stop()", async () => {
    const server = createEmbeddedServer();
    await server.start();
    await server.stop();

    expect(mockServerInstance.stop).toHaveBeenCalled();
  });

  it("getUrl() returns localhost URL with port", () => {
    const server = createEmbeddedServer();
    expect(server.getUrl()).toBe("http://127.0.0.1:8314");
  });
});
