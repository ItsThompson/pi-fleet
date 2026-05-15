import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AttentionBadge } from "./AttentionBadge";

describe("AttentionBadge", () => {
  it("renders nothing when count is 0", () => {
    const { container } = render(<AttentionBadge count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders count for 1-9", () => {
    render(<AttentionBadge count={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders '9+' when count exceeds 9", () => {
    render(<AttentionBadge count={12} />);
    expect(screen.getByText("9+")).toBeInTheDocument();
  });

  it("renders '9+' for count exactly 10", () => {
    render(<AttentionBadge count={10} />);
    expect(screen.getByText("9+")).toBeInTheDocument();
  });

  it("renders count exactly 9", () => {
    render(<AttentionBadge count={9} />);
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("includes aria-label with actual count", () => {
    render(<AttentionBadge count={15} />);
    expect(screen.getByLabelText("15 needs attention")).toBeInTheDocument();
  });
});
