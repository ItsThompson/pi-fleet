import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AllPodsView } from "./AllPodsView";
import { usePodStore } from "@/stores/pod-store";
import { useSessionStore } from "@/stores/session-store";
import { useFilterStore } from "@/stores/filter-store";
import type { Pod, RegisteredSession } from "@pi-fleet/shared";

function buildSession(
	overrides?: Partial<RegisteredSession>,
): RegisteredSession {
	return {
		sessionId: "s-1",
		pid: 123,
		cwd: "/home/user/project",
		tmuxTarget: "%0",
		startTime: "2025-01-01T00:00:00Z",
		activity: "processing",
		lastSeen: "2025-01-01T00:01:00Z",
		lastEventTime: "2025-01-01T00:01:00Z",
		agentName: "worker",
		model: "Claude Sonnet 4",
		contextUsage: { tokens: 10000, contextWindow: 200000, percent: 5 },
		turnCount: 3,
		...overrides,
	};
}

function buildPod(overrides?: Partial<Pod>): Pod {
	return {
		leadSessionId: "s-1",
		memberSessionIds: ["s-1"],
		displayName: "test-pod",
		state: "processing",
		attentionCount: 0,
		...overrides,
	};
}

describe("AllPodsView", () => {
	beforeEach(() => {
		usePodStore.setState({ pods: new Map() });
		useSessionStore.setState({
			sessions: new Map(),
			activityChangedAt: new Map(),
		});
		useFilterStore.setState({ activeFilters: new Set() });
	});

	it("renders pods grouped into attention and working sections", () => {
		const sessions = new Map<string, RegisteredSession>([
			["s-idle", buildSession({ sessionId: "s-idle", activity: "idle" })],
			[
				"s-working",
				buildSession({ sessionId: "s-working", activity: "processing" }),
			],
			[
				"s-approval",
				buildSession({ sessionId: "s-approval", activity: "pending_approval" }),
			],
		]);
		const pods = new Map<string, Pod>([
			[
				"s-idle",
				buildPod({
					leadSessionId: "s-idle",
					memberSessionIds: ["s-idle"],
					displayName: "idle-pod",
					state: "idle",
					attentionCount: 1,
				}),
			],
			[
				"s-working",
				buildPod({
					leadSessionId: "s-working",
					memberSessionIds: ["s-working"],
					displayName: "working-pod",
					state: "processing",
					attentionCount: 0,
				}),
			],
			[
				"s-approval",
				buildPod({
					leadSessionId: "s-approval",
					memberSessionIds: ["s-approval"],
					displayName: "approval-pod",
					state: "pending_approval",
					attentionCount: 1,
				}),
			],
		]);

		useSessionStore.setState({ sessions, activityChangedAt: new Map() });
		usePodStore.setState({ pods });

		render(<AllPodsView />);

		expect(screen.getByText("All Pods")).toBeInTheDocument();
		expect(screen.getByText("Needs Attention (2)")).toBeInTheDocument();
		expect(screen.getByText("Working (1)")).toBeInTheDocument();
	});

	it("shows empty message when no pods exist", () => {
		usePodStore.setState({ pods: new Map() });
		useSessionStore.setState({
			sessions: new Map(),
			activityChangedAt: new Map(),
		});

		render(<AllPodsView />);

		expect(screen.getByText("All Pods")).toBeInTheDocument();
		expect(screen.getByText("No pods in this cluster.")).toBeInTheDocument();
	});

	it("shows filtered-empty message when filters remove all pods", () => {
		const sessions = new Map<string, RegisteredSession>([
			["s-1", buildSession({ sessionId: "s-1", activity: "processing" })],
		]);
		const pods = new Map<string, Pod>([
			[
				"s-1",
				buildPod({
					leadSessionId: "s-1",
					memberSessionIds: ["s-1"],
					displayName: "a-pod",
					state: "processing",
					attentionCount: 0,
				}),
			],
		]);

		useSessionStore.setState({ sessions, activityChangedAt: new Map() });
		usePodStore.setState({ pods });
		// Set a filter that won't match anything
		useFilterStore.setState({
			activeFilters: new Set(["idle"]),
			podPassesFilter: () => false,
		});

		render(<AllPodsView />);

		expect(
			screen.getByText("No pods match the active filters."),
		).toBeInTheDocument();
	});

	it("renders only working section when no pods need attention", () => {
		const sessions = new Map<string, RegisteredSession>([
			["s-1", buildSession({ sessionId: "s-1", activity: "processing" })],
			["s-2", buildSession({ sessionId: "s-2", activity: "running_tool" })],
		]);
		const pods = new Map<string, Pod>([
			[
				"s-1",
				buildPod({
					leadSessionId: "s-1",
					memberSessionIds: ["s-1"],
					displayName: "pod-a",
					state: "processing",
					attentionCount: 0,
				}),
			],
			[
				"s-2",
				buildPod({
					leadSessionId: "s-2",
					memberSessionIds: ["s-2"],
					displayName: "pod-b",
					state: "running_tool",
					attentionCount: 0,
				}),
			],
		]);

		useSessionStore.setState({ sessions, activityChangedAt: new Map() });
		usePodStore.setState({ pods });

		render(<AllPodsView />);

		expect(screen.queryByText(/Needs Attention/)).not.toBeInTheDocument();
		expect(screen.getByText("Working (2)")).toBeInTheDocument();
	});
});
