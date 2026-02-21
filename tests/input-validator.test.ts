import { describe, test, expect } from "bun:test";
import {
  validateDescription,
  validateIssueTitle,
  validateIssueBody,
  validateAuthor,
  validateSearchQuery,
} from "../src/middleware/input-validator";

describe("validateDescription", () => {
  test("allows empty", () => {
    expect(validateDescription(undefined)).toEqual({ clean: "" });
    expect(validateDescription("")).toEqual({ clean: "" });
  });

  test("trims whitespace", () => {
    expect(validateDescription("  hello  ")).toEqual({ clean: "hello" });
  });

  test("rejects over 500 chars", () => {
    const long = "a".repeat(501);
    const result = validateDescription(long);
    expect(result.error).toBeDefined();
  });

  test("allows exactly 500 chars", () => {
    const exact = "a".repeat(500);
    const result = validateDescription(exact);
    expect(result.error).toBeUndefined();
  });
});

describe("validateIssueTitle", () => {
  test("requires non-empty", () => {
    expect(validateIssueTitle("").error).toBeDefined();
    expect(validateIssueTitle("  ").error).toBeDefined();
    expect(validateIssueTitle(undefined).error).toBeDefined();
  });

  test("allows valid title", () => {
    expect(validateIssueTitle("Fix bug")).toEqual({ clean: "Fix bug" });
  });

  test("rejects over 300 chars", () => {
    expect(validateIssueTitle("a".repeat(301)).error).toBeDefined();
  });
});

describe("validateAuthor", () => {
  test("defaults to anonymous", () => {
    expect(validateAuthor(undefined)).toEqual({ clean: "anonymous" });
    expect(validateAuthor("")).toEqual({ clean: "anonymous" });
  });

  test("strips control characters", () => {
    expect(validateAuthor("hello\x00world")).toEqual({ clean: "helloworld" });
  });

  test("truncates at 100 chars", () => {
    const result = validateAuthor("a".repeat(150));
    expect(result.clean.length).toBe(100);
  });
});

describe("validateSearchQuery", () => {
  test("allows empty", () => {
    expect(validateSearchQuery(undefined)).toEqual({ clean: "" });
  });

  test("rejects over 200 chars", () => {
    expect(validateSearchQuery("a".repeat(201)).error).toBeDefined();
  });
});
