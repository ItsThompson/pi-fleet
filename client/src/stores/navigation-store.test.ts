import { describe, it, expect, beforeEach } from "vitest";
import { useNavigationStore } from "./navigation-store";

describe("navigation-store", () => {
	beforeEach(() => {
		useNavigationStore.setState({
			current: { view: "cluster", id: undefined },
		});
	});

	it("defaults to cluster view with no id", () => {
		const { current } = useNavigationStore.getState();
		expect(current.view).toBe("cluster");
		expect(current.id).toBeUndefined();
	});

	it("navigates to a pod view", () => {
		useNavigationStore.getState().navigateTo("pod", "pod-123");

		const { current } = useNavigationStore.getState();
		expect(current.view).toBe("pod");
		expect(current.id).toBe("pod-123");
	});

	it("navigates to cluster view", () => {
		useNavigationStore.getState().navigateTo("pod", "pod-1");
		useNavigationStore.getState().navigateTo("cluster", "cluster-1");

		const { current } = useNavigationStore.getState();
		expect(current.view).toBe("cluster");
		expect(current.id).toBe("cluster-1");
	});

	it("navigates to notifications", () => {
		useNavigationStore.getState().navigateTo("notifications");

		const { current } = useNavigationStore.getState();
		expect(current.view).toBe("notifications");
		expect(current.id).toBeUndefined();
	});

	describe("resetIfViewing", () => {
		it("resets to AllPodsView when matching view and id", () => {
			useNavigationStore.getState().navigateTo("pod", "pod-123");

			useNavigationStore.getState().resetIfViewing("pod", "pod-123");

			const { current } = useNavigationStore.getState();
			expect(current.view).toBe("cluster");
			expect(current.id).toBeUndefined();
		});

		it("is a no-op when view type does not match", () => {
			useNavigationStore.getState().navigateTo("cluster", "cluster-1");
			const stateBefore = useNavigationStore.getState();

			useNavigationStore.getState().resetIfViewing("pod", "pod-123");

			const stateAfter = useNavigationStore.getState();
			expect(stateAfter.current).toBe(stateBefore.current);
		});

		it("is a no-op when id does not match", () => {
			useNavigationStore.getState().navigateTo("pod", "pod-999");
			const stateBefore = useNavigationStore.getState();

			useNavigationStore.getState().resetIfViewing("pod", "pod-123");

			const stateAfter = useNavigationStore.getState();
			expect(stateAfter.current).toBe(stateBefore.current);
		});

		it("returns same state reference on no-op (referential equality)", () => {
			useNavigationStore.getState().navigateTo("pod", "pod-1");
			const stateBefore = useNavigationStore.getState();

			useNavigationStore.getState().resetIfViewing("cluster", "cluster-1");

			const stateAfter = useNavigationStore.getState();
			expect(stateAfter).toBe(stateBefore);
		});
	});
});
