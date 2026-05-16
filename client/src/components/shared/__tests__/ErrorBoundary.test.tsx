import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "../ErrorBoundary";

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test render error");
  }
  return <div>Content rendered successfully</div>;
}

/**
 * A controllable throwing component. Reads from an external ref
 * to decide whether to throw. This avoids React 19 concurrent rendering
 * race conditions with static flags.
 */
const throwControl = { shouldThrow: true };

function ControllableThrow() {
  if (throwControl.shouldThrow) {
    throw new Error("Controlled render error");
  }
  return <div>Recovered after retry</div>;
}

describe("ErrorBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    throwControl.shouldThrow = true;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children normally when no error occurs", () => {
    render(
      <ErrorBoundary level="test">
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Content rendered successfully")).toBeInTheDocument();
  });

  it("renders fallback when child throws during render", () => {
    render(
      <ErrorBoundary level="test">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("displays error message in dev mode", () => {
    render(
      <ErrorBoundary level="test">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Test render error")).toBeInTheDocument();
  });

  it("calls console.error with error and component stack", () => {
    render(
      <ErrorBoundary level="content">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    const boundaryLogCall = consoleErrorSpy.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        call[0].includes("[ErrorBoundary:content]"),
    );

    expect(boundaryLogCall).toBeDefined();
    expect(boundaryLogCall![1]).toBeInstanceOf(Error);
    expect(boundaryLogCall![1].message).toBe("Test render error");
    // componentStack is the third argument
    expect(boundaryLogCall![2]).toBeDefined();
  });

  it("includes boundary level in log message", () => {
    render(
      <ErrorBoundary level="sidebar">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    const boundaryLogCall = consoleErrorSpy.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        call[0].includes("[ErrorBoundary:sidebar]"),
    );
    expect(boundaryLogCall).toBeDefined();
  });

  it("uses 'unknown' level when level prop is not provided", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    const boundaryLogCall = consoleErrorSpy.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        call[0].includes("[ErrorBoundary:unknown]"),
    );
    expect(boundaryLogCall).toBeDefined();
  });

  it("re-mounts children after retry click", async () => {
    const user = userEvent.setup();
    throwControl.shouldThrow = true;

    render(
      <ErrorBoundary level="test">
        <ControllableThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Stop throwing before retry
    throwControl.shouldThrow = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByText("Recovered after retry")).toBeInTheDocument();
  });

  it("catches error again if children throw on retry", async () => {
    const user = userEvent.setup();

    render(
      <ErrorBoundary level="test">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("uses custom fallback when provided", () => {
    render(
      <ErrorBoundary
        level="test"
        fallback={({ error }) => <div>Custom: {error.message}</div>}
      >
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Custom: Test render error")).toBeInTheDocument();
  });

  it("passes error and retry function to custom fallback", async () => {
    const user = userEvent.setup();
    throwControl.shouldThrow = true;

    render(
      <ErrorBoundary
        level="test"
        fallback={({ error, retry }) => (
          <div>
            <span>{error.message}</span>
            <button onClick={retry}>Custom Retry</button>
          </div>
        )}
      >
        <ControllableThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Controlled render error")).toBeInTheDocument();

    // Stop throwing before retry
    throwControl.shouldThrow = false;
    await user.click(screen.getByRole("button", { name: "Custom Retry" }));

    expect(screen.getByText("Recovered after retry")).toBeInTheDocument();
  });
});

describe("ErrorBoundary isolation", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("content boundary catches error while sidebar remains functional", () => {
    render(
      <ErrorBoundary level="app">
        <div className="flex">
          <ErrorBoundary level="sidebar">
            <div>Sidebar content</div>
          </ErrorBoundary>
          <ErrorBoundary level="content">
            <ThrowingComponent shouldThrow={true} />
          </ErrorBoundary>
        </div>
      </ErrorBoundary>,
    );

    expect(screen.getByText("Sidebar content")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("sidebar boundary catches error while content remains functional", () => {
    render(
      <ErrorBoundary level="app">
        <div className="flex">
          <ErrorBoundary level="sidebar">
            <ThrowingComponent shouldThrow={true} />
          </ErrorBoundary>
          <ErrorBoundary level="content">
            <div>Main content area</div>
          </ErrorBoundary>
        </div>
      </ErrorBoundary>,
    );

    expect(screen.getByText("Main content area")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("app boundary catches error when inner boundary not present", () => {
    render(
      <ErrorBoundary level="app">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
