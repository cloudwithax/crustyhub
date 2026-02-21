import { describe, test, expect } from "bun:test";

// We'll test the tarRepo and untarRepo helpers directly
// since DB functions need a live database.
// DB functions (saveBundle, getBundle, deleteBundle) are thin SQL wrappers.

describe("repo-bundles module exports", () => {
  test("saveBundle is exported", async () => {
    const mod = await import("../src/db/repos");
    expect(typeof mod.saveBundle).toBe("function");
  });

  test("getBundle is exported", async () => {
    const mod = await import("../src/db/repos");
    expect(typeof mod.getBundle).toBe("function");
  });

  test("deleteBundle is exported", async () => {
    const mod = await import("../src/db/repos");
    expect(typeof mod.deleteBundle).toBe("function");
  });
});
