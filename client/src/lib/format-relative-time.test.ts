import { describe, it, expect, vi, afterEach } from "vitest";
import { formatRelativeTime } from "./format-relative-time";

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for timestamps less than a minute ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:00:30Z"));
    expect(formatRelativeTime("2025-01-01T12:00:00Z")).toBe("just now");
  });

  it("returns minutes for timestamps 1-59 minutes ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:05:00Z"));
    expect(formatRelativeTime("2025-01-01T12:00:00Z")).toBe("5m ago");
  });

  it("returns hours for timestamps 1-23 hours ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T14:00:00Z"));
    expect(formatRelativeTime("2025-01-01T12:00:00Z")).toBe("2h ago");
  });

  it("returns days for timestamps 24+ hours ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-03T12:00:00Z"));
    expect(formatRelativeTime("2025-01-01T12:00:00Z")).toBe("2d ago");
  });

  it("returns 'just now' for future timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:00:00Z"));
    expect(formatRelativeTime("2025-01-01T13:00:00Z")).toBe("just now");
  });
});
