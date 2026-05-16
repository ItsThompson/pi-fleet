import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFilteredPods, useFilteredSessions } from "./useFilteredPodGrid";
import { useFilterStore } from "@/stores/filter-store";
import { useSessionStore } from "@/stores/session-store";
import type { Pod, RegisteredSession } from "@pi-fleet/shared";

function buildPod(overrides?: Partial<Pod>): Pod {
	return {
		leadSessionId: "pod-1",
		memberSessionIds: ["session-1"],
		displayName: "Test Pod",
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
		tmuxTarget: "main:1.0",
		startTime: "2025-01-01T00:00:00Z",
		activity: "processing",
		lastSeen: "2025-01-01T00:01:00Z",
		lastEventTime: "2025-01-01T00:01:00Z",
		...overrides,
	};
}

describe("useFilteredPods", () => {
	beforeEach(() => {
		useFilterStore.setState({ activeFilters: new Set() });
		useSessionStore.setState({
			sessions: new Map(),
			activityChangedAt: new Map(),
		});
	});

	it("returns all pods split by attention/working when no filters active", () => {
		const pods = [
			buildPod({ leadSessionId: "a", state: "pending_approval" }),
			buildPod({ leadSessionId: "b", state: "idle" }),
			buildPod({ leadSessionId: "c", state: "processing" }),
			buildPod({ leadSessionId: "d", state: "running_tool" }),
		];

		const { result } = renderHook(() => useFilteredPods(pods));

		expect(result.current.attentionItems).toHaveLength(2);
		expect(result.current.workingItems).toHaveLength(2);
		expect(result.current.totalCount).toBe(4);
		expect(result.current.filteredCount).toBe(4);
	});

	it("filters pods by single active filter", () => {
		const sessions = new Map<string, RegisteredSession>([
			["s1", buildSession({ sessionId: "s1", activity: "idle" })],
			["s2", buildSession({ sessionId: "s2", activity: "processing" })],
			["s3", buildSession({ sessionId: "s3", activity: "idle" })],
		]);
		useSessionStore.setState({ sessions });
		useFilterStore.setState({ activeFilters: new Set(["idle"]) });

		const pods = [
			buildPod({ leadSessionId: "a", state: "idle", memberSessionIds: ["s1"] }),
			buildPod({
				leadSessionId: "b",
				state: "processing",
				memberSessionIds: ["s2"],
			}),
			buildPod({ leadSessionId: "c", state: "idle", memberSessionIds: ["s3"] }),
		];

		const { result } = renderHook(() => useFilteredPods(pods));

		expect(result.current.attentionItems).toHaveLength(2);
		expect(result.current.workingItems).toHaveLength(0);
		expect(result.current.totalCount).toBe(3);
		expect(result.current.filteredCount).toBe(2);
	});

	it("filters pods by multiple active filters", () => {
		const sessions = new Map<string, RegisteredSession>([
			["s1", buildSession({ sessionId: "s1", activity: "idle" })],
			["s2", buildSession({ sessionId: "s2", activity: "pending_approval" })],
			["s3", buildSession({ sessionId: "s3", activity: "processing" })],
		]);
		useSessionStore.setState({ sessions });
		useFilterStore.setState({
			activeFilters: new Set(["idle", "pending_approval"]),
		});

		const pods = [
			buildPod({ leadSessionId: "a", state: "idle", memberSessionIds: ["s1"] }),
			buildPod({
				leadSessionId: "b",
				state: "pending_approval",
				memberSessionIds: ["s2"],
			}),
			buildPod({
				leadSessionId: "c",
				state: "processing",
				memberSessionIds: ["s3"],
			}),
		];

		const { result } = renderHook(() => useFilteredPods(pods));

		expect(result.current.attentionItems).toHaveLength(2);
		expect(result.current.workingItems).toHaveLength(0);
		expect(result.current.totalCount).toBe(3);
		expect(result.current.filteredCount).toBe(2);
	});

	it("returns empty result for empty pod list", () => {
		const { result } = renderHook(() => useFilteredPods([]));

		expect(result.current.attentionItems).toHaveLength(0);
		expect(result.current.workingItems).toHaveLength(0);
		expect(result.current.totalCount).toBe(0);
		expect(result.current.filteredCount).toBe(0);
	});

	it("classifies all attention pods correctly", () => {
		const pods = [
			buildPod({ leadSessionId: "a", state: "pending_approval" }),
			buildPod({ leadSessionId: "b", state: "idle" }),
		];

		const { result } = renderHook(() => useFilteredPods(pods));

		expect(result.current.attentionItems).toHaveLength(2);
		expect(result.current.workingItems).toHaveLength(0);
	});

	it("classifies all working pods correctly", () => {
		const pods = [
			buildPod({ leadSessionId: "a", state: "processing" }),
			buildPod({ leadSessionId: "b", state: "running_tool" }),
		];

		const { result } = renderHook(() => useFilteredPods(pods));

		expect(result.current.attentionItems).toHaveLength(0);
		expect(result.current.workingItems).toHaveLength(2);
	});
});

describe("useFilteredSessions", () => {
	beforeEach(() => {
		useFilterStore.setState({ activeFilters: new Set() });
	});

	it("returns all sessions split by attention/working when no filters active", () => {
		const sessions = [
			buildSession({ sessionId: "s1", activity: "pending_approval" }),
			buildSession({ sessionId: "s2", activity: "idle" }),
			buildSession({ sessionId: "s3", activity: "processing" }),
			buildSession({ sessionId: "s4", activity: "running_tool" }),
		];

		const { result } = renderHook(() => useFilteredSessions(sessions));

		expect(result.current.attentionItems).toHaveLength(2);
		expect(result.current.workingItems).toHaveLength(2);
		expect(result.current.totalCount).toBe(4);
		expect(result.current.filteredCount).toBe(4);
	});

	it("filters sessions by single active filter", () => {
		useFilterStore.setState({ activeFilters: new Set(["idle"]) });

		const sessions = [
			buildSession({ sessionId: "s1", activity: "idle" }),
			buildSession({ sessionId: "s2", activity: "processing" }),
			buildSession({ sessionId: "s3", activity: "idle" }),
		];

		const { result } = renderHook(() => useFilteredSessions(sessions));

		expect(result.current.attentionItems).toHaveLength(2);
		expect(result.current.workingItems).toHaveLength(0);
		expect(result.current.totalCount).toBe(3);
		expect(result.current.filteredCount).toBe(2);
	});

	it("filters sessions by multiple active filters", () => {
		useFilterStore.setState({ activeFilters: new Set(["idle", "processing"]) });

		const sessions = [
			buildSession({ sessionId: "s1", activity: "idle" }),
			buildSession({ sessionId: "s2", activity: "processing" }),
			buildSession({ sessionId: "s3", activity: "running_tool" }),
			buildSession({ sessionId: "s4", activity: "pending_approval" }),
		];

		const { result } = renderHook(() => useFilteredSessions(sessions));

		expect(result.current.attentionItems).toHaveLength(1);
		expect(result.current.workingItems).toHaveLength(1);
		expect(result.current.totalCount).toBe(4);
		expect(result.current.filteredCount).toBe(2);
	});

	it("returns empty result for empty session list", () => {
		const { result } = renderHook(() => useFilteredSessions([]));

		expect(result.current.attentionItems).toHaveLength(0);
		expect(result.current.workingItems).toHaveLength(0);
		expect(result.current.totalCount).toBe(0);
		expect(result.current.filteredCount).toBe(0);
	});

	it("classifies all attention sessions correctly", () => {
		const sessions = [
			buildSession({ sessionId: "s1", activity: "pending_approval" }),
			buildSession({ sessionId: "s2", activity: "idle" }),
		];

		const { result } = renderHook(() => useFilteredSessions(sessions));

		expect(result.current.attentionItems).toHaveLength(2);
		expect(result.current.workingItems).toHaveLength(0);
	});

	it("classifies all working sessions correctly", () => {
		const sessions = [
			buildSession({ sessionId: "s1", activity: "processing" }),
			buildSession({ sessionId: "s2", activity: "running_tool" }),
		];

		const { result } = renderHook(() => useFilteredSessions(sessions));

		expect(result.current.attentionItems).toHaveLength(0);
		expect(result.current.workingItems).toHaveLength(2);
	});
});
