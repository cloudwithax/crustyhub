# Git Data in PostgreSQL Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Store bare git repo data as tar.gz bundles in PostgreSQL so repos survive container restarts.

**Architecture:** Filesystem stays the working copy for `git-http-backend`. After each push, the bare repo is tar.gz'd and upserted into a `repo_bundles` table. On startup, missing repos are restored from the DB. The DB becomes the single source of truth.

**Tech Stack:** Bun (runtime + test runner), PostgreSQL via `postgres` npm package, Node `zlib`/`tar` for archiving.

---

### Task 1: Add `repo_bundles` table to schema

**Files:**
- Modify: `src/db/index.ts:82-86` (before the final `console.log`)

**Step 1: Add the CREATE TABLE statement**

In `src/db/index.ts`, add this block before the `console.log("database tables initialized")` line (line 85):

```typescript
  await sql`
    CREATE TABLE IF NOT EXISTS repo_bundles (
      id BIGSERIAL PRIMARY KEY,
      repo_id BIGINT NOT NULL UNIQUE REFERENCES repos(id) ON DELETE CASCADE,
      bundle BYTEA NOT NULL,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
```

**Step 2: Verify it compiles**

Run: `cd /home/clxud/Documents/github/crustyhub && bun build src/db/index.ts --no-bundle 2>&1 | head -20`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/db/index.ts
git commit -m "feat(db): add repo_bundles table for git data persistence"
```

---

### Task 2: Add bundle DB functions

**Files:**
- Modify: `src/db/repos.ts` (append new functions at end of file)

**Step 1: Write the failing test**

Create `tests/repo-bundles.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/repo-bundles.test.ts`
Expected: FAIL — `saveBundle`, `getBundle`, `deleteBundle` not exported.

**Step 3: Add the three DB functions**

Append to `src/db/repos.ts`:

```typescript
export async function saveBundle(repoId: number, bundle: Buffer): Promise<void> {
  await sql`
    INSERT INTO repo_bundles (repo_id, bundle, size_bytes, updated_at)
    VALUES (${repoId}, ${bundle}, ${bundle.length}, now())
    ON CONFLICT (repo_id) DO UPDATE SET
      bundle = ${bundle},
      size_bytes = ${bundle.length},
      updated_at = now()
  `;
}

export async function getBundle(repoId: number): Promise<Buffer | null> {
  const rows = await sql<{ bundle: Buffer }[]>`
    SELECT bundle FROM repo_bundles WHERE repo_id = ${repoId}
  `;
  return rows[0]?.bundle ?? null;
}

export async function deleteBundle(repoId: number): Promise<void> {
  await sql`DELETE FROM repo_bundles WHERE repo_id = ${repoId}`;
}

export async function getAllBundles(): Promise<{ repo_id: number; slug: string; bundle: Buffer }[]> {
  return sql<{ repo_id: number; slug: string; bundle: Buffer }[]>`
    SELECT rb.repo_id, r.slug, rb.bundle
    FROM repo_bundles rb
    JOIN repos r ON r.id = rb.repo_id
    WHERE r.deleted_at IS NULL
  `;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/repo-bundles.test.ts`
Expected: PASS — all three functions are now exported.

**Step 5: Commit**

```bash
git add src/db/repos.ts tests/repo-bundles.test.ts
git commit -m "feat(db): add saveBundle, getBundle, deleteBundle, getAllBundles"
```

---

### Task 3: Add tar/untar helpers and `bundleRepo`/`restoreRepos`

**Files:**
- Modify: `src/services/repo-service.ts`

**Step 1: Write the failing test for tar round-trip**

Add to `tests/repo-bundles.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/repo-bundles.test.ts`
Expected: FAIL — `tarDirectory` and `untarToDirectory` not exported from repo-service.

**Step 3: Add tar helpers, bundleRepo, and restoreRepos**

Add these imports to the top of `src/services/repo-service.ts`:

```typescript
import { mkdir, rename, rm } from "fs/promises";
```

(Change the existing `import { mkdir, rename }` to include `rm`.)

Then add these functions to `src/services/repo-service.ts`:

```typescript
export function tarDirectory(dirPath: string): Buffer {
  const result = Bun.spawnSync(["tar", "-czf", "-", "-C", dirPath, "."], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(`tar failed: ${Buffer.from(result.stderr).toString()}`);
  }
  return Buffer.from(result.stdout);
}

export function untarToDirectory(tarball: Buffer, destPath: string): void {
  const result = Bun.spawnSync(["tar", "-xzf", "-", "-C", destPath], {
    stdin: tarball,
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(`untar failed: ${Buffer.from(result.stderr).toString()}`);
  }
}

export async function bundleRepo(slug: string): Promise<void> {
  const repo = await reposDb.findRepoBySlug(slug);
  if (!repo) return;

  const path = repoPath(slug);
  if (!existsSync(path)) return;

  const tarball = tarDirectory(path);
  await reposDb.saveBundle(repo.id, tarball);
}

export async function restoreRepos(): Promise<void> {
  const bundles = await reposDb.getAllBundles();
  let restored = 0;

  for (const { slug, bundle } of bundles) {
    const path = repoPath(slug);
    if (existsSync(path)) continue;

    await mkdir(path, { recursive: true });
    untarToDirectory(bundle, path);
    restored++;
    console.log(`restored repo from db: ${slug}`);
  }

  if (restored > 0) {
    console.log(`restored ${restored} repo(s) from database`);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/repo-bundles.test.ts`
Expected: PASS — tar round-trip works, exports exist.

**Step 5: Commit**

```bash
git add src/services/repo-service.ts tests/repo-bundles.test.ts
git commit -m "feat(repo-service): add tar/untar helpers, bundleRepo, restoreRepos"
```

---

### Task 4: Wire bundleRepo into push flow

**Files:**
- Modify: `src/routes/git.ts:1-5` (imports) and `src/routes/git.ts:62-63` (after push)

**Step 1: Add import**

In `src/routes/git.ts`, change line 2:

```typescript
import { ensureRepoForPush } from "../services/repo-service";
```

to:

```typescript
import { ensureRepoForPush, bundleRepo } from "../services/repo-service";
```

**Step 2: Add bundleRepo call after push**

In `src/routes/git.ts`, after line 63 (`invalidateCache(slug).catch(() => {});`), add:

```typescript
      bundleRepo(slug).catch(() => {});
```

**Step 3: Verify it compiles**

Run: `bun build src/routes/git.ts --no-bundle 2>&1 | head -20`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/routes/git.ts
git commit -m "feat(git): bundle repo to DB after each push"
```

---

### Task 5: Wire restoreRepos into startup

**Files:**
- Modify: `src/index.ts:4` (imports) and `src/index.ts:18-19` (startup sequence)

**Step 1: Update import**

In `src/index.ts`, change line 4:

```typescript
import { ensureDirectories } from "./services/repo-service";
```

to:

```typescript
import { ensureDirectories, restoreRepos } from "./services/repo-service";
```

**Step 2: Add restoreRepos call after initDb**

In `src/index.ts`, after line 19 (`await initDb();`), add:

```typescript
await restoreRepos();
```

**Step 3: Verify it compiles**

Run: `bun build src/index.ts --no-bundle 2>&1 | head -20`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(startup): restore missing repos from DB on boot"
```

---

### Task 6: Update deleteRepo and forkRepo

**Files:**
- Modify: `src/services/repo-service.ts:48-60` (deleteRepo) and `src/services/repo-service.ts:62-82` (forkRepo)

**Step 1: Update deleteRepo to also delete the bundle**

In `deleteRepo`, after the `softDeleteRepo` call, add:

```typescript
  await reposDb.deleteBundle(repo.id);
```

So the full function becomes:

```typescript
export async function deleteRepo(slug: string): Promise<void> {
  const repo = await reposDb.findRepoBySlug(slug);
  if (!repo) throw new Error("repo not found");

  const src = repoPath(slug);
  const dst = trashPath(slug);

  if (existsSync(src)) {
    await rename(src, dst);
  }

  await reposDb.softDeleteRepo(repo.id);
  await reposDb.deleteBundle(repo.id);
}
```

**Step 2: Update forkRepo to bundle the new repo immediately**

At the end of `forkRepo`, before the return, add a fire-and-forget bundle:

```typescript
export async function forkRepo(sourceSlug: string, newSlug: string): Promise<reposDb.Repo> {
  if (!validateSlug(newSlug)) throw new Error("invalid repository name");

  const source = await reposDb.findRepoBySlug(sourceSlug);
  if (!source) throw new Error("source repo not found");

  const srcPath = repoPath(sourceSlug);
  const dstPath = repoPath(newSlug);

  const proc = Bun.spawn(["git", "clone", "--bare", srcPath, dstPath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`fork failed: ${err}`);
  }

  const newRepo = await reposDb.createRepo(newSlug, `Fork of ${sourceSlug}`, "fork", null, source.id);

  // Bundle the forked repo to DB immediately
  const tarball = tarDirectory(dstPath);
  await reposDb.saveBundle(newRepo.id, tarball);

  return newRepo;
}
```

**Step 3: Verify it compiles**

Run: `bun build src/services/repo-service.ts --no-bundle 2>&1 | head -20`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/services/repo-service.ts
git commit -m "feat(repo-service): delete bundle on repo delete, bundle on fork"
```

---

### Task 7: Also fix ensureRepoForPush to restore from DB

**Files:**
- Modify: `src/services/repo-service.ts:31-46` (ensureRepoForPush)

The current `ensureRepoForPush` silently skips DB row creation when the directory already exists. But there's also the reverse case: the DB row exists but the directory is missing (exactly the bug we hit). We should try restoring from the bundle before creating a fresh repo.

**Step 1: Update ensureRepoForPush**

Replace the function with:

```typescript
export async function ensureRepoForPush(slug: string): Promise<void> {
  if (!validateSlug(slug)) throw new Error("invalid repository name");

  const diskBlock = await checkDiskSpace();
  if (diskBlock) throw new Error("server disk space critically low");

  const path = repoPath(slug);
  if (existsSync(path)) return;

  // Try restoring from DB bundle first
  const existing = await reposDb.findRepoBySlug(slug);
  if (existing) {
    const bundle = await reposDb.getBundle(existing.id);
    if (bundle) {
      await mkdir(path, { recursive: true });
      untarToDirectory(bundle, path);
      return;
    }
  }

  // Fresh repo
  await gitInit(path);

  if (!existing) {
    await reposDb.createRepo(slug, "", "push");
  }
}
```

**Step 2: Verify it compiles**

Run: `bun build src/services/repo-service.ts --no-bundle 2>&1 | head -20`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/services/repo-service.ts
git commit -m "feat(repo-service): restore from DB bundle in ensureRepoForPush"
```

---

### Task 8: Run full test suite and verify

**Step 1: Run all tests**

Run: `bun test`
Expected: All tests pass.

**Step 2: Verify the `rm` import change didn't break anything**

Check that the import at the top of `src/services/repo-service.ts` now reads:

```typescript
import { mkdir, rename, rm } from "fs/promises";
```

(Note: `rm` was added in Task 3 but may not actually be used in the final code since `restoreRepos` doesn't delete anything. If it's unused, remove it. Only import what's used.)

**Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: clean up unused imports"
```

---

### Summary of all changes

| File | What changed |
|------|-------------|
| `src/db/index.ts` | Added `repo_bundles` CREATE TABLE |
| `src/db/repos.ts` | Added `saveBundle`, `getBundle`, `deleteBundle`, `getAllBundles` |
| `src/services/repo-service.ts` | Added `tarDirectory`, `untarToDirectory`, `bundleRepo`, `restoreRepos`; updated `ensureRepoForPush`, `deleteRepo`, `forkRepo` |
| `src/routes/git.ts` | Added `bundleRepo(slug)` call after push |
| `src/index.ts` | Added `restoreRepos()` call on startup |
| `tests/repo-bundles.test.ts` | New test file for tar round-trip and export verification |
