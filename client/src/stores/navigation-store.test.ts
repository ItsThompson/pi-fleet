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
});
