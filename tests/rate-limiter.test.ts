import { describe, test, expect } from "bun:test";
import { checkRateLimit, classifyRequest, getClientIp } from "../src/middleware/rate-limiter";

describe("classifyRequest", () => {
  test("classifies GET as read", () => {
    expect(classifyRequest("GET", "/my-repo")).toBe("read");
  });

  test("classifies POST as write", () => {
    expect(classifyRequest("POST", "/new")).toBe("write");
  });

  test("classifies git-upload-pack as git-read", () => {
    expect(classifyRequest("POST", "/repo.git/git-upload-pack")).toBe("git-read");
  });

  test("classifies git-receive-pack as git-write", () => {
    expect(classifyRequest("POST", "/repo.git/git-receive-pack")).toBe("git-write");
  });

  test("classifies info/refs as git-read", () => {
    expect(classifyRequest("GET", "/repo.git/info/refs")).toBe("git-read");
  });
});

describe("checkRateLimit", () => {
  test("allows requests within limit", () => {
    const result = checkRateLimit("test-ip-1", "read");
    expect(result).toBeNull();
  });

  test("blocks after exceeding limit", () => {
    const ip = "test-ip-burst-" + Date.now();
    for (let i = 0; i < 20; i++) {
      checkRateLimit(ip, "write");
    }
    const blocked = checkRateLimit(ip, "write");
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
  });
});

describe("getClientIp", () => {
  test("extracts from x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  test("extracts from x-real-ip", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "9.8.7.6" },
    });
    expect(getClientIp(req)).toBe("9.8.7.6");
  });

  test("returns unknown when no headers", () => {
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBe("unknown");
  });
});
