import { describe, it, expect } from "vitest";
import {
  SERVER_PORT,
  HEARTBEAT_INTERVAL_MS,
  REAP_TIMEOUT_MS,
  SSE_KEEPALIVE_MS,
} from "./constants.js";

describe("constants", () => {
  it("exports SERVER_PORT as 8314", () => {
    expect(SERVER_PORT).toBe(8314);
  });

  it("exports HEARTBEAT_INTERVAL_MS as 5000", () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(5000);
  });

  it("exports REAP_TIMEOUT_MS as 15000", () => {
    expect(REAP_TIMEOUT_MS).toBe(15000);
  });

  it("exports SSE_KEEPALIVE_MS as 30000", () => {
    expect(SSE_KEEPALIVE_MS).toBe(30000);
  });

  it("REAP_TIMEOUT_MS is greater than HEARTBEAT_INTERVAL_MS", () => {
    expect(REAP_TIMEOUT_MS).toBeGreaterThan(HEARTBEAT_INTERVAL_MS);
  });
});
