import { describe, it, expect } from "vitest";
import { ATTENTION_STATES, isAttentionState } from "./attention.js";
import type { ActivityStatus } from "./types/session.js";

describe("isAttentionState", () => {
  it('returns true for "pending_approval"', () => {
    expect(isAttentionState("pending_approval")).toBe(true);
  });

  it('returns true for "idle"', () => {
    expect(isAttentionState("idle")).toBe(true);
  });

  it('returns false for "processing"', () => {
    expect(isAttentionState("processing")).toBe(false);
  });

  it('returns false for "running_tool"', () => {
    expect(isAttentionState("running_tool")).toBe(false);
  });

  it("returns false for unknown values cast as ActivityStatus", () => {
    expect(isAttentionState("unknown_value" as ActivityStatus)).toBe(false);
  });
});

describe("ATTENTION_STATES", () => {
  it("contains exactly pending_approval and idle", () => {
    expect([...ATTENTION_STATES].sort()).toEqual(["idle", "pending_approval"]);
  });

  it("has size 2", () => {
    expect(ATTENTION_STATES.size).toBe(2);
  });
});
