import { describe, test, expect } from "bun:test";
import { scoreWriteRequest, isBanned, checkBannedPatterns } from "../src/middleware/spam-detector";

describe("scoreWriteRequest", () => {
  test("allows normal requests", () => {
    const ip = "spam-test-normal-" + Date.now();
    const result = scoreWriteRequest(ip, { title: "Bug report", body: "Something is broken" });
    expect(result).toBeNull();
  });

  test("flags rapid-fire writes", () => {
    const ip = "spam-test-rapid-" + Date.now();
    let blocked = null;
    for (let i = 0; i < 15; i++) {
      const result = scoreWriteRequest(ip, { title: `Issue ${i}`, body: `Body ${i}` });
      if (result) {
        blocked = result;
        break;
      }
    }
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
  });
});

describe("isBanned", () => {
  test("returns null for non-banned IP", () => {
    expect(isBanned("never-banned-ip")).toBeNull();
  });
});

describe("checkBannedPatterns", () => {
  test("returns null with no patterns configured", () => {
    expect(checkBannedPatterns("normal text")).toBeNull();
  });
});
