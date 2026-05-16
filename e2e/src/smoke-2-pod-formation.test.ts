import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	createTestHarness,
	MockSession,
	type TestHarness,
} from "./helpers/index.js";

describe("Smoke 2: Pod Formation", () => {
	let harness: TestHarness;

	beforeEach(async () => {
		harness = await createTestHarness();
	});

	afterEach(async () => {
		await harness.cleanup();
	});

	it("parent reports ownership and child nests under parent", async () => {
		// Register parent session
		const parent = new MockSession(harness.baseUrl, {
			agentName: "orchestrator",
			cwd: "/Users/test/project",
		});
		await parent.register();

		// Register child session with a subagentId
		const child = new MockSession(harness.baseUrl, {
			agentName: "worker-1",
			subagentId: "sub-1",
			cwd: "/Users/test/project",
		});
		await child.register();

		// Parent reports ownership of the child
		const ownershipRes = await fetch(`${harness.baseUrl}/api/pods/ownership`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				parentSessionId: parent.sessionId,
				subagentIds: ["sub-1"],
			}),
		});
		expect(ownershipRes.status).toBe(200);
		const ownershipBody = await ownershipRes.json();
		expect(ownershipBody.matchedIds).toContain("sub-1");

		// Verify pod structure
		const podsRes = await fetch(`${harness.baseUrl}/api/pods`);
		const podsBody = await podsRes.json();

		// Should be one multi-member pod (not two single-member pods)
		expect(podsBody.pods).toHaveLength(1);
		const pod = podsBody.pods[0];
		expect(pod.leadSessionId).toBe(parent.sessionId);
		expect(pod.memberSessionIds).toContain(parent.sessionId);
		expect(pod.memberSessionIds).toContain(child.sessionId);
		expect(pod.displayName).toBe("orchestrator");
	});

	it("killing child returns pod to single-member", async () => {
		const parent = new MockSession(harness.baseUrl, {
			agentName: "orchestrator",
		});
		await parent.register();

		const child = new MockSession(harness.baseUrl, {
			subagentId: "sub-1",
		});
		await child.register();

		// Form pod
		await fetch(`${harness.baseUrl}/api/pods/ownership`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				parentSessionId: parent.sessionId,
				subagentIds: ["sub-1"],
			}),
		});

		// Kill child
		await child.unregister();

		// Pod should still exist with just the parent
		const podsRes = await fetch(`${harness.baseUrl}/api/pods`);
		const podsBody = await podsRes.json();
		expect(podsBody.pods).toHaveLength(1);
		expect(podsBody.pods[0].leadSessionId).toBe(parent.sessionId);
		expect(podsBody.pods[0].memberSessionIds).toEqual([parent.sessionId]);
	});

	it("killing parent promotes children to standalone pods", async () => {
		const parent = new MockSession(harness.baseUrl, {
			agentName: "orchestrator",
		});
		await parent.register();

		const child1 = new MockSession(harness.baseUrl, {
			agentName: "worker-1",
			subagentId: "sub-1",
		});
		await child1.register();

		const child2 = new MockSession(harness.baseUrl, {
			agentName: "worker-2",
			subagentId: "sub-2",
		});
		await child2.register();

		// Form pod with both children
		await fetch(`${harness.baseUrl}/api/pods/ownership`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				parentSessionId: parent.sessionId,
				subagentIds: ["sub-1", "sub-2"],
			}),
		});

		// Kill parent
		await parent.unregister();

		// Children should become standalone pods
		const podsRes = await fetch(`${harness.baseUrl}/api/pods`);
		const podsBody = await podsRes.json();
		expect(podsBody.pods).toHaveLength(2);

		const podSessionIds = podsBody.pods.map(
			(pod: { leadSessionId: string }) => pod.leadSessionId,
		);
		expect(podSessionIds).toContain(child1.sessionId);
		expect(podSessionIds).toContain(child2.sessionId);

		// Each pod should be single-member
		podsBody.pods.forEach((pod: { memberSessionIds: string[] }) => {
			expect(pod.memberSessionIds).toHaveLength(1);
		});
	});

	it("pod state aggregates worst state among members", async () => {
		const parent = new MockSession(harness.baseUrl, {
			agentName: "orchestrator",
		});
		await parent.register();

		const child = new MockSession(harness.baseUrl, {
			subagentId: "sub-1",
		});
		await child.register();

		// Form pod
		await fetch(`${harness.baseUrl}/api/pods/ownership`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				parentSessionId: parent.sessionId,
				subagentIds: ["sub-1"],
			}),
		});

		// Parent is processing, child needs approval
		await parent.heartbeat("processing");
		await child.heartbeat("pending_approval");

		// Pod state should reflect worst: pending_approval
		const podsRes = await fetch(`${harness.baseUrl}/api/pods`);
		const podsBody = await podsRes.json();
		expect(podsBody.pods[0].state).toBe("pending_approval");
		expect(podsBody.pods[0].attentionCount).toBe(1);
	});

	it("ownership report with unknown subagentIds waits for registration", async () => {
		const parent = new MockSession(harness.baseUrl, {
			agentName: "orchestrator",
		});
		await parent.register();

		// Report ownership before child registers
		const ownershipRes = await fetch(`${harness.baseUrl}/api/pods/ownership`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				parentSessionId: parent.sessionId,
				subagentIds: ["sub-not-yet-registered"],
			}),
		});
		const ownershipBody = await ownershipRes.json();
		expect(ownershipBody.unmatchedIds).toContain("sub-not-yet-registered");

		// Pod is still single-member (child not matched yet)
		let podsRes = await fetch(`${harness.baseUrl}/api/pods`);
		let podsBody = await podsRes.json();
		expect(podsBody.pods).toHaveLength(1);
		expect(podsBody.pods[0].memberSessionIds).toHaveLength(1);

		// Now child registers
		const child = new MockSession(harness.baseUrl, {
			subagentId: "sub-not-yet-registered",
		});
		await child.register();

		// Pod should now have two members
		podsRes = await fetch(`${harness.baseUrl}/api/pods`);
		podsBody = await podsRes.json();
		expect(podsBody.pods).toHaveLength(1);
		expect(podsBody.pods[0].memberSessionIds).toHaveLength(2);
	});
});
