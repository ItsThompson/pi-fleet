import { describe, it, expect, beforeEach } from "vitest";
import { usePodStore } from "./pod-store";
import type { Pod } from "@pi-fleet/shared";

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

describe("pod-store", () => {
	beforeEach(() => {
		usePodStore.setState({ pods: new Map() });
	});

	it("adds a pod", () => {
		usePodStore.getState().addOrUpdatePod(buildPod());
		expect(usePodStore.getState().pods.size).toBe(1);
	});

	it("updates an existing pod", () => {
		usePodStore.getState().addOrUpdatePod(buildPod());
		usePodStore
			.getState()
			.addOrUpdatePod(buildPod({ state: "idle", attentionCount: 1 }));

		const pod = usePodStore.getState().pods.get("lead-1")!;
		expect(pod.state).toBe("idle");
		expect(pod.attentionCount).toBe(1);
	});

	it("removes a pod", () => {
		usePodStore.getState().addOrUpdatePod(buildPod());
		usePodStore.getState().removePod("lead-1");
		expect(usePodStore.getState().pods.size).toBe(0);
	});

	it("sets pods in bulk", () => {
		usePodStore.getState().addOrUpdatePod(buildPod({ leadSessionId: "old" }));

		usePodStore
			.getState()
			.setPods([
				buildPod({ leadSessionId: "a" }),
				buildPod({ leadSessionId: "b" }),
			]);

		const { pods } = usePodStore.getState();
		expect(pods.size).toBe(2);
		expect(pods.has("a")).toBe(true);
		expect(pods.has("b")).toBe(true);
		expect(pods.has("old")).toBe(false);
	});
});
