import { describe, it, expect } from "vitest";
import { createSessionDataCollector } from "./session-data.js";

describe("SessionDataCollector", () => {
  describe("initial state", () => {
    it("starts with defaults", () => {
      const collector = createSessionDataCollector();
      expect(collector.model).toBeNull();
      expect(collector.contextUsage).toBeNull();
      expect(collector.turnCount).toBe(0);
      expect(collector.thinkingLevel).toBe("off");
      expect(collector.lastToolName).toBeNull();
    });

    it("snapshot returns undefined for null fields", () => {
      const collector = createSessionDataCollector();
      const snap = collector.snapshot();
      expect(snap.model).toBeUndefined();
      expect(snap.contextUsage).toBeUndefined();
      expect(snap.turnCount).toBe(0);
      expect(snap.thinkingLevel).toBe("off");
      expect(snap.lastToolName).toBeUndefined();
    });
  });

  describe("onModelSelect", () => {
    it("tracks model changes", () => {
      const collector = createSessionDataCollector();
      collector.onModelSelect("Claude Sonnet 4");
      expect(collector.model).toBe("Claude Sonnet 4");
      expect(collector.snapshot().model).toBe("Claude Sonnet 4");
    });

    it("overwrites previous model", () => {
      const collector = createSessionDataCollector();
      collector.onModelSelect("Claude Sonnet 4");
      collector.onModelSelect("Claude Opus 4");
      expect(collector.model).toBe("Claude Opus 4");
    });
  });

  describe("onTurnStart", () => {
    it("increments turnCount on each call", () => {
      const collector = createSessionDataCollector();
      collector.onTurnStart();
      expect(collector.turnCount).toBe(1);
      collector.onTurnStart();
      expect(collector.turnCount).toBe(2);
      collector.onTurnStart();
      expect(collector.turnCount).toBe(3);
    });

    it("reflects in snapshot", () => {
      const collector = createSessionDataCollector();
      collector.onTurnStart();
      collector.onTurnStart();
      expect(collector.snapshot().turnCount).toBe(2);
    });
  });

  describe("onToolExecutionEnd", () => {
    it("captures last tool name", () => {
      const collector = createSessionDataCollector();
      collector.onToolExecutionEnd("bash");
      expect(collector.lastToolName).toBe("bash");
      expect(collector.snapshot().lastToolName).toBe("bash");
    });

    it("overwrites with most recent tool", () => {
      const collector = createSessionDataCollector();
      collector.onToolExecutionEnd("bash");
      collector.onToolExecutionEnd("read");
      collector.onToolExecutionEnd("edit");
      expect(collector.lastToolName).toBe("edit");
    });
  });

  describe("onThinkingLevelSelect", () => {
    it("updates thinking level", () => {
      const collector = createSessionDataCollector();
      collector.onThinkingLevelSelect("high");
      expect(collector.thinkingLevel).toBe("high");
      expect(collector.snapshot().thinkingLevel).toBe("high");
    });
  });

  describe("updateContextUsage", () => {
    it("stores context usage", () => {
      const collector = createSessionDataCollector();
      const usage = { tokens: 5000, contextWindow: 200000, percent: 3 };
      collector.updateContextUsage(usage);
      expect(collector.contextUsage).toEqual(usage);
      expect(collector.snapshot().contextUsage).toEqual(usage);
    });

    it("handles null tokens", () => {
      const collector = createSessionDataCollector();
      const usage = { tokens: null, contextWindow: 200000, percent: null };
      collector.updateContextUsage(usage);
      expect(collector.contextUsage).toEqual(usage);
    });

    it("can be cleared back to null", () => {
      const collector = createSessionDataCollector();
      collector.updateContextUsage({
        tokens: 5000,
        contextWindow: 200000,
        percent: 3,
      });
      collector.updateContextUsage(null);
      expect(collector.contextUsage).toBeNull();
      expect(collector.snapshot().contextUsage).toBeUndefined();
    });
  });

  describe("snapshot aggregation", () => {
    it("returns all data in heartbeat-ready format", () => {
      const collector = createSessionDataCollector();
      collector.onModelSelect("Claude Sonnet 4");
      collector.onTurnStart();
      collector.onTurnStart();
      collector.onToolExecutionEnd("grep");
      collector.onThinkingLevelSelect("medium");
      collector.updateContextUsage({
        tokens: 10000,
        contextWindow: 200000,
        percent: 5,
      });

      expect(collector.snapshot()).toEqual({
        model: "Claude Sonnet 4",
        contextUsage: { tokens: 10000, contextWindow: 200000, percent: 5 },
        turnCount: 2,
        thinkingLevel: "medium",
        lastToolName: "grep",
      });
    });
  });
});
