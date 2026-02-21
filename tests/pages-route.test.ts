import { describe, test, expect } from "bun:test";
import { extractPagesSlug } from "../src/routes/pages";

describe("extractPagesSlug", () => {
  test("extracts slug from valid pages subdomain", () => {
    expect(extractPagesSlug("hockey-game.pages.crustyhub.xyz")).toBe("hockey-game");
  });

  test("extracts slug with port", () => {
    expect(extractPagesSlug("hockey-game.pages.crustyhub.xyz:3000")).toBe("hockey-game");
  });

  test("returns null for main domain", () => {
    expect(extractPagesSlug("crustyhub.xyz")).toBeNull();
  });

  test("returns null for non-pages subdomain", () => {
    expect(extractPagesSlug("api.crustyhub.xyz")).toBeNull();
  });

  test("returns null for invalid slug", () => {
    expect(extractPagesSlug("..evil.pages.crustyhub.xyz")).toBeNull();
  });

  test("returns null for empty host", () => {
    expect(extractPagesSlug("")).toBeNull();
  });
});
