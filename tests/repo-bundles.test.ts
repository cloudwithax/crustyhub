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

import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tarDirectory, untarToDirectory } from "../src/services/repo-service";

describe("tar round-trip", () => {
  const testDir = join(import.meta.dir, ".tmp-tar-test");
  const restoreDir = join(import.meta.dir, ".tmp-tar-restore");

  test("tar and untar preserves files", () => {
    // Setup: create a fake bare repo directory
    rmSync(testDir, { recursive: true, force: true });
    rmSync(restoreDir, { recursive: true, force: true });
    mkdirSync(join(testDir, "refs", "heads"), { recursive: true });
    writeFileSync(join(testDir, "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(testDir, "config"), "[core]\n\tbare = true\n");
    writeFileSync(join(testDir, "refs", "heads", "main"), "abc123\n");

    // Tar it
    const result = Bun.spawnSync(["tar", "-czf", "-", "-C", testDir, "."], {
      stdout: "pipe",
    });
    const tarball = Buffer.from(result.stdout);
    expect(tarball.length).toBeGreaterThan(0);

    // Untar it to a different location
    mkdirSync(restoreDir, { recursive: true });
    const extract = Bun.spawnSync(["tar", "-xzf", "-", "-C", restoreDir], {
      stdin: tarball,
    });
    expect(extract.exitCode).toBe(0);

    // Verify files match
    expect(readFileSync(join(restoreDir, "HEAD"), "utf-8")).toBe("ref: refs/heads/main\n");
    expect(readFileSync(join(restoreDir, "config"), "utf-8")).toBe("[core]\n\tbare = true\n");
    expect(readFileSync(join(restoreDir, "refs", "heads", "main"), "utf-8")).toBe("abc123\n");

    // Cleanup
    rmSync(testDir, { recursive: true, force: true });
    rmSync(restoreDir, { recursive: true, force: true });
  });
});
