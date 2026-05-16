import { describe, it, expect, beforeEach } from "vitest";
import { useNotificationDismissStore } from "./notification-dismiss-store";

describe("notification-dismiss-store", () => {
  beforeEach(() => {
    useNotificationDismissStore.setState({ dismissed: new Map() });
  });

  describe("dismiss", () => {
    it("adds a session to the dismissed map", () => {
      useNotificationDismissStore.getState().dismiss("session-1", "2025-01-01T00:01:00Z");

      const { dismissed } = useNotificationDismissStore.getState();
      expect(dismissed.has("session-1")).toBe(true);
      expect(dismissed.get("session-1")?.dismissedStateChangedAt).toBe("2025-01-01T00:01:00Z");
    });

    it("overwrites a previous dismissal for the same session", () => {
      const store = useNotificationDismissStore.getState();
      store.dismiss("session-1", "2025-01-01T00:01:00Z");
      store.dismiss("session-1", "2025-01-01T00:05:00Z");

      const { dismissed } = useNotificationDismissStore.getState();
      expect(dismissed.get("session-1")?.dismissedStateChangedAt).toBe("2025-01-01T00:05:00Z");
    });

    it("does not affect other dismissed sessions", () => {
      const store = useNotificationDismissStore.getState();
      store.dismiss("session-1", "2025-01-01T00:01:00Z");
      store.dismiss("session-2", "2025-01-01T00:02:00Z");

      const { dismissed } = useNotificationDismissStore.getState();
      expect(dismissed.size).toBe(2);
      expect(dismissed.has("session-1")).toBe(true);
      expect(dismissed.has("session-2")).toBe(true);
    });
  });

  describe("dismissAll", () => {
    it("dismisses all provided entries", () => {
      const entries = [
        { sessionId: "session-1", stateChangedAt: "2025-01-01T00:01:00Z" },
        { sessionId: "session-2", stateChangedAt: "2025-01-01T00:02:00Z" },
        { sessionId: "session-3", stateChangedAt: "2025-01-01T00:03:00Z" },
      ];

      useNotificationDismissStore.getState().dismissAll(entries);

      const { dismissed } = useNotificationDismissStore.getState();
      expect(dismissed.size).toBe(3);
      expect(dismissed.get("session-1")?.dismissedStateChangedAt).toBe("2025-01-01T00:01:00Z");
      expect(dismissed.get("session-2")?.dismissedStateChangedAt).toBe("2025-01-01T00:02:00Z");
      expect(dismissed.get("session-3")?.dismissedStateChangedAt).toBe("2025-01-01T00:03:00Z");
    });

    it("preserves existing dismissals not in the provided entries", () => {
      useNotificationDismissStore.getState().dismiss("session-existing", "2025-01-01T00:00:00Z");

      useNotificationDismissStore.getState().dismissAll([
        { sessionId: "session-new", stateChangedAt: "2025-01-01T00:05:00Z" },
      ]);

      const { dismissed } = useNotificationDismissStore.getState();
      expect(dismissed.has("session-existing")).toBe(true);
      expect(dismissed.has("session-new")).toBe(true);
    });
  });

  describe("isDismissed", () => {
    it("returns false when session was never dismissed", () => {
      const result = useNotificationDismissStore.getState().isDismissed("session-1", "2025-01-01T00:01:00Z");
      expect(result).toBe(false);
    });

    it("returns true when currentStateChangedAt matches dismissedStateChangedAt", () => {
      useNotificationDismissStore.getState().dismiss("session-1", "2025-01-01T00:01:00Z");

      const result = useNotificationDismissStore.getState().isDismissed("session-1", "2025-01-01T00:01:00Z");
      expect(result).toBe(true);
    });

    it("returns true when currentStateChangedAt is older than dismissedStateChangedAt", () => {
      useNotificationDismissStore.getState().dismiss("session-1", "2025-01-01T00:05:00Z");

      const result = useNotificationDismissStore.getState().isDismissed("session-1", "2025-01-01T00:01:00Z");
      expect(result).toBe(true);
    });

    it("returns false when currentStateChangedAt is newer (session cycled: re-notification)", () => {
      useNotificationDismissStore.getState().dismiss("session-1", "2025-01-01T00:01:00Z");

      const result = useNotificationDismissStore.getState().isDismissed("session-1", "2025-01-01T00:05:00Z");
      expect(result).toBe(false);
    });

    it("handles re-notification correctly after full cycle", () => {
      const store = useNotificationDismissStore.getState();

      // Session is idle at T1, user dismisses it
      store.dismiss("session-1", "2025-01-01T00:01:00Z");
      expect(store.isDismissed("session-1", "2025-01-01T00:01:00Z")).toBe(true);

      // Session transitions (idle → active → idle), activityChangedAt updates to T2
      expect(useNotificationDismissStore.getState().isDismissed("session-1", "2025-01-01T00:10:00Z")).toBe(false);
    });
  });
});
