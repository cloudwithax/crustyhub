import { describe, test, expect } from "bun:test";
import { getOrCreateCsrfToken, validateCsrfToken } from "../src/middleware/csrf";

describe("CSRF", () => {
  test("generates token for session", () => {
    const token = getOrCreateCsrfToken("test-session-1");
    expect(token).toBeTruthy();
    expect(token.length).toBe(64);
  });

  test("returns same token for same session", () => {
    const t1 = getOrCreateCsrfToken("test-session-2");
    const t2 = getOrCreateCsrfToken("test-session-2");
    expect(t1).toBe(t2);
  });

  test("validates correct token", () => {
    const token = getOrCreateCsrfToken("test-session-3");
    expect(validateCsrfToken("test-session-3", token)).toBe(true);
  });

  test("rejects wrong token", () => {
    getOrCreateCsrfToken("test-session-4");
    expect(validateCsrfToken("test-session-4", "wrong-token")).toBe(false);
  });

  test("rejects missing token", () => {
    getOrCreateCsrfToken("test-session-5");
    expect(validateCsrfToken("test-session-5", undefined)).toBe(false);
  });

  test("rejects unknown session", () => {
    expect(validateCsrfToken("nonexistent", "some-token")).toBe(false);
  });
});
