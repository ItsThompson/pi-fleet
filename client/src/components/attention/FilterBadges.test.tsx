import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBadges } from "./FilterBadges";
import { useFilterStore } from "@/stores/filter-store";
import type { RegisteredSession } from "@pi-fleet/shared";

function buildSession(
	overrides?: Partial<RegisteredSession>,
): RegisteredSession {
	return {
		sessionId: "session-1",
		pid: 1234,
		cwd: "/home/user/project",
		tmuxTarget: "%0",
		startTime: "2025-01-01T00:00:00Z",
		activity: "processing",
		lastSeen: "2025-01-01T00:01:00Z",
		lastEventTime: "2025-01-01T00:01:00Z",
		...overrides,
	};
}

describe("FilterBadges", () => {
	beforeEach(() => {
		useFilterStore.setState({ activeFilters: new Set() });
	});

	it("renders badges only for states with non-zero count", () => {
		const sessions = [
			buildSession({ sessionId: "s1", activity: "idle" }),
			buildSession({ sessionId: "s2", activity: "idle" }),
			buildSession({ sessionId: "s3", activity: "processing" }),
		];

		render(<FilterBadges sessions={sessions} />);

		expect(screen.getByText("Idle (2)")).toBeInTheDocument();
		expect(screen.getByText("Processing (1)")).toBeInTheDocument();
		expect(screen.queryByText(/Pending Approval/)).not.toBeInTheDocument();
	});

	it("renders separate badges for processing and running_tool", () => {
		const sessions = [
			buildSession({ sessionId: "s1", activity: "processing" }),
			buildSession({ sessionId: "s2", activity: "running_tool" }),
			buildSession({ sessionId: "s3", activity: "running_tool" }),
		];

		render(<FilterBadges sessions={sessions} />);

		expect(screen.getByText("Processing (1)")).toBeInTheDocument();
		expect(screen.getByText("Running Tool (2)")).toBeInTheDocument();
	});

	it("clicking Processing badge toggles only processing filter", () => {
		const sessions = [
			buildSession({ sessionId: "s1", activity: "processing" }),
			buildSession({ sessionId: "s2", activity: "running_tool" }),
		];

		render(<FilterBadges sessions={sessions} />);

		const badge = screen.getByRole("button", { name: /Filter Processing/i });
		fireEvent.click(badge);

		const { activeFilters } = useFilterStore.getState();
		expect(activeFilters.has("processing")).toBe(true);
		expect(activeFilters.has("running_tool")).toBe(false);
	});

	it("clicking Running Tool badge toggles only running_tool filter", () => {
		const sessions = [
			buildSession({ sessionId: "s1", activity: "processing" }),
			buildSession({ sessionId: "s2", activity: "running_tool" }),
		];

		render(<FilterBadges sessions={sessions} />);

		const badge = screen.getByRole("button", { name: /Filter Running Tool/i });
		fireEvent.click(badge);

		const { activeFilters } = useFilterStore.getState();
		expect(activeFilters.has("running_tool")).toBe(true);
		expect(activeFilters.has("processing")).toBe(false);
	});

	it("clicking a badge toggles the filter", () => {
		const sessions = [buildSession({ sessionId: "s1", activity: "idle" })];

		render(<FilterBadges sessions={sessions} />);

		const badge = screen.getByRole("button", { name: /Filter Idle/i });
		expect(badge).toHaveAttribute("aria-pressed", "false");

		fireEvent.click(badge);
		expect(useFilterStore.getState().activeFilters.has("idle")).toBe(true);
	});

	it("clicking an active badge removes the filter", () => {
		useFilterStore.setState({ activeFilters: new Set(["idle"]) });
		const sessions = [buildSession({ sessionId: "s1", activity: "idle" })];

		render(<FilterBadges sessions={sessions} />);

		const badge = screen.getByRole("button", { name: /Filter Idle/i });
		expect(badge).toHaveAttribute("aria-pressed", "true");

		fireEvent.click(badge);
		expect(useFilterStore.getState().activeFilters.has("idle")).toBe(false);
	});

	it("renders nothing when no sessions provided", () => {
		const { container } = render(<FilterBadges sessions={[]} />);
		expect(container.querySelectorAll("button").length).toBe(0);
	});
});
