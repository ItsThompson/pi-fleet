import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "./Sidebar";
import { usePodStore } from "@/stores/pod-store";
import { useSessionStore } from "@/stores/session-store";
import { useNavigationStore } from "@/stores/navigation-store";
import type { Pod, RegisteredSession } from "@pi-fleet/shared";

function buildPod(overrides?: Partial<Pod>): Pod {
	return {
		leadSessionId: "lead-1",
		memberSessionIds: ["lead-1"],
		displayName: "my-project",
		state: "processing",
		attentionCount: 0,
		...overrides,
	};
}

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

describe("Sidebar", () => {
	beforeEach(() => {
		usePodStore.setState({ pods: new Map() });
		useSessionStore.setState({
			sessions: new Map(),
			activityChangedAt: new Map(),
		});
		useNavigationStore.setState({
			current: { view: "cluster", id: undefined },
		});
	});

	it("renders Unclustered section", () => {
		render(<Sidebar />);
		expect(screen.getByText("Unclustered")).toBeInTheDocument();
	});

	it("shows pods in the sidebar", () => {
		const pods = new Map([
			[
				"lead-1",
				buildPod({ leadSessionId: "lead-1", displayName: "api-service" }),
			],
			[
				"lead-2",
				buildPod({ leadSessionId: "lead-2", displayName: "frontend" }),
			],
		]);
		usePodStore.setState({ pods });

		render(<Sidebar />);
		expect(screen.getByText("api-service")).toBeInTheDocument();
		expect(screen.getByText("frontend")).toBeInTheDocument();
	});

	it("shows attention badge on pods", () => {
		const pods = new Map([
			[
				"lead-1",
				buildPod({
					leadSessionId: "lead-1",
					memberSessionIds: ["lead-1", "sub-1", "sub-2"],
					attentionCount: 3,
				}),
			],
		]);
		const sessions = new Map([
			["lead-1", buildSession({ sessionId: "lead-1", activity: "idle" })],
			[
				"sub-1",
				buildSession({ sessionId: "sub-1", activity: "pending_approval" }),
			],
			["sub-2", buildSession({ sessionId: "sub-2", activity: "idle" })],
		]);
		usePodStore.setState({ pods });
		useSessionStore.setState({ sessions, activityChangedAt: new Map() });

		render(<Sidebar />);
		// Badge appears on both cluster section (derived attention) and pod row
		const badges = screen.getAllByText("3");
		expect(badges.length).toBe(2);
	});

	it("navigates to pod view on pod row click", async () => {
		const user = userEvent.setup();
		const pods = new Map([
			["lead-1", buildPod({ leadSessionId: "lead-1", displayName: "my-pod" })],
		]);
		usePodStore.setState({ pods });

		render(<Sidebar />);
		await user.click(screen.getByText("my-pod"));

		const { current } = useNavigationStore.getState();
		expect(current.view).toBe("pod");
		expect(current.id).toBe("lead-1");
	});

	it("shows 'No pods' when cluster is empty", () => {
		render(<Sidebar />);
		expect(screen.getByText("No pods")).toBeInTheDocument();
	});

	it("cluster section is collapsible", async () => {
		const user = userEvent.setup();
		const pods = new Map([
			["lead-1", buildPod({ displayName: "collapsible-test" })],
		]);
		usePodStore.setState({ pods });

		render(<Sidebar />);
		expect(screen.getByText("collapsible-test")).toBeInTheDocument();

		// Click the chevron/trigger to collapse
		const trigger = screen.getByRole("button", { expanded: true });
		await user.click(trigger);

		expect(screen.queryByText("collapsible-test")).not.toBeInTheDocument();
	});
});
