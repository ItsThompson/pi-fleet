import { describe, it, expect } from "vitest";
import { registerBodySchema, heartbeatBodySchema } from "./schemas.js";
import { ACTIVITY_STATUSES } from "@pi-fleet/shared";

describe("registerBodySchema", () => {
	const validPayload = {
		sessionId: "sess-123",
		pid: 1234,
		cwd: "/Users/test/project",
		tmuxTarget: "%0",
		startTime: "2025-01-01T00:00:00.000Z",
	};

	it("accepts a valid minimal payload", () => {
		const result = registerBodySchema.safeParse(validPayload);
		expect(result.success).toBe(true);
	});

	it("accepts a payload with all optional fields", () => {
		const full = {
			...validPayload,
			agentName: "pi-agent",
			subagentId: "sub-456",
			model: "Claude Sonnet 4",
			contextUsage: { tokens: 5000, contextWindow: 128000, percent: 4 },
			thinkingLevel: "high",
		};
		const result = registerBodySchema.safeParse(full);
		expect(result.success).toBe(true);
	});

	it("accepts null tmuxTarget", () => {
		const payload = { ...validPayload, tmuxTarget: null };
		const result = registerBodySchema.safeParse(payload);
		expect(result.success).toBe(true);
	});

	it("accepts contextUsage with null tokens and percent", () => {
		const payload = {
			...validPayload,
			contextUsage: { tokens: null, contextWindow: 128000, percent: null },
		};
		const result = registerBodySchema.safeParse(payload);
		expect(result.success).toBe(true);
	});

	it("rejects missing sessionId", () => {
		const { sessionId: _, ...payload } = validPayload;
		const result = registerBodySchema.safeParse(payload);
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((issue) => issue.path.join("."));
			expect(paths).toContain("sessionId");
		}
	});

	it("rejects empty sessionId", () => {
		const result = registerBodySchema.safeParse({
			...validPayload,
			sessionId: "",
		});
		expect(result.success).toBe(false);
	});

	it("rejects missing pid", () => {
		const { pid: _, ...payload } = validPayload;
		const result = registerBodySchema.safeParse(payload);
		expect(result.success).toBe(false);
	});

	it("rejects non-positive pid", () => {
		const result = registerBodySchema.safeParse({ ...validPayload, pid: 0 });
		expect(result.success).toBe(false);
	});

	it("rejects missing cwd", () => {
		const { cwd: _, ...payload } = validPayload;
		const result = registerBodySchema.safeParse(payload);
		expect(result.success).toBe(false);
	});

	it("rejects invalid contextUsage shape", () => {
		const result = registerBodySchema.safeParse({
			...validPayload,
			contextUsage: { tokens: "bad" },
		});
		expect(result.success).toBe(false);
	});
});

describe("heartbeatBodySchema", () => {
	const validPayload = {
		sessionId: "sess-123",
		activity: "processing" as const,
		lastEventTime: "2025-01-01T00:00:01.000Z",
	};

	it("accepts a valid minimal payload", () => {
		const result = heartbeatBodySchema.safeParse(validPayload);
		expect(result.success).toBe(true);
	});

	it("accepts all optional fields", () => {
		const full = {
			...validPayload,
			tmuxTarget: "%0",
			agentName: "pi-agent",
			model: "Claude Sonnet 4",
			contextUsage: { tokens: 10000, contextWindow: 128000, percent: 8 },
			turnCount: 5,
			thinkingLevel: "medium",
			lastToolName: "read",
		};
		const result = heartbeatBodySchema.safeParse(full);
		expect(result.success).toBe(true);
	});

	it("accepts null tmuxTarget", () => {
		const result = heartbeatBodySchema.safeParse({
			...validPayload,
			tmuxTarget: null,
		});
		expect(result.success).toBe(true);
	});

	it("rejects invalid activity status", () => {
		const result = heartbeatBodySchema.safeParse({
			...validPayload,
			activity: "invalid_state",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((issue) => issue.path.join("."));
			expect(paths).toContain("activity");
		}
	});

	it("rejects missing sessionId", () => {
		const { sessionId: _, ...payload } = validPayload;
		const result = heartbeatBodySchema.safeParse(payload);
		expect(result.success).toBe(false);
	});

	it("rejects missing activity", () => {
		const { activity: _, ...payload } = validPayload;
		const result = heartbeatBodySchema.safeParse(payload);
		expect(result.success).toBe(false);
	});

	it("rejects negative turnCount", () => {
		const result = heartbeatBodySchema.safeParse({
			...validPayload,
			turnCount: -1,
		});
		expect(result.success).toBe(false);
	});

	it("accepts all valid activity statuses", () => {
		for (const activity of ACTIVITY_STATUSES) {
			const result = heartbeatBodySchema.safeParse({
				...validPayload,
				activity,
			});
			expect(result.success).toBe(true);
		}
	});
});
