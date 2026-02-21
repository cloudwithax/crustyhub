# CrustyHub Pages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-deploy static sites from repos with a `.pages` config to `<slug>.pages.crustyhub.xyz` subdomains.

**Architecture:** Hybrid git-read + disk cache. Subdomain requests are intercepted before the Elysia router. Files are read from bare git repos via `git show`, cached to disk keyed by commit SHA, and served with proper MIME types. Cache invalidates on push.

**Tech Stack:** Bun, Elysia.js, TypeScript, git CLI, TOML parsing (minimal hand-rolled parser)

---

### Task 1: Add PAGES_DOMAIN and PAGES_CACHE_DIR to env config

**Files:**
- Modify: `src/config/env.ts:1-10`

**Step 1: Add the new env vars**

Add after line 10 (after `BASE_URL`):

```typescript
export const PAGES_DOMAIN = process.env.PAGES_DOMAIN || "pages.crustyhub.xyz";
export const PAGES_CACHE_DIR = join(DATA_DIR, "pages-cache");
```

**Step 2: Commit**

```bash
git add src/config/env.ts
git commit -m "feat(pages): add PAGES_DOMAIN and PAGES_CACHE_DIR env config"
```

---

### Task 2: Create pages service with TOML parser, git reader, and cache manager

**Files:**
- Create: `src/services/pages-service.ts`
- Test: `tests/pages-service.test.ts`

**Step 1: Write the failing tests**

Create `tests/pages-service.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { parsePagesConfig, type PagesConfig } from "../src/services/pages-service";

describe("parsePagesConfig", () => {
  test("parses full .pages TOML config", () => {
    const toml = `[pages]\ndirectory = "dist"\nentry = "app.html"`;
    const config = parsePagesConfig(toml);
    expect(config).toEqual({ directory: "dist", entry: "app.html" });
  });

  test("uses defaults for empty [pages] section", () => {
    const config = parsePagesConfig("[pages]\n");
    expect(config).toEqual({ directory: ".", entry: "index.html" });
  });

  test("uses defaults for minimal config", () => {
    const config = parsePagesConfig("[pages]");
    expect(config).toEqual({ directory: ".", entry: "index.html" });
  });

  test("returns null for missing [pages] section", () => {
    const config = parsePagesConfig("# just a comment");
    expect(config).toBeNull();
  });

  test("returns null for empty string", () => {
    const config = parsePagesConfig("");
    expect(config).toBeNull();
  });

  test("handles directory-only config", () => {
    const config = parsePagesConfig(`[pages]\ndirectory = "public"`);
    expect(config).toEqual({ directory: "public", entry: "index.html" });
  });

  test("handles entry-only config", () => {
    const config = parsePagesConfig(`[pages]\nentry = "main.html"`);
    expect(config).toEqual({ directory: ".", entry: "main.html" });
  });

  test("rejects directory with path traversal", () => {
    const config = parsePagesConfig(`[pages]\ndirectory = "../evil"`);
    expect(config).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/pages-service.test.ts`
Expected: FAIL — module not found

**Step 3: Implement pages-service.ts**

Create `src/services/pages-service.ts`:

```typescript
import { join } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { rm } from "fs/promises";
import { gitExec } from "../git/git-spawn";
import { repoPath } from "../git/paths";
import { PAGES_CACHE_DIR } from "../config/env";

export interface PagesConfig {
  directory: string;
  entry: string;
}

export function parsePagesConfig(raw: string): PagesConfig | null {
  if (!raw || !raw.includes("[pages]")) return null;

  const lines = raw.split("\n");
  let inPagesSection = false;
  let directory = ".";
  let entry = "index.html";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "[pages]") {
      inPagesSection = true;
      continue;
    }
    if (trimmed.startsWith("[") && trimmed !== "[pages]") {
      inPagesSection = false;
      continue;
    }
    if (!inPagesSection) continue;

    const match = trimmed.match(/^(\w+)\s*=\s*"([^"]*)"$/);
    if (!match) continue;

    const [, key, value] = match;
    if (key === "directory") directory = value;
    if (key === "entry") entry = value;
  }

  // Reject path traversal
  if (directory.includes("..") || entry.includes("..")) return null;

  return { directory, entry };
}

export async function getPagesConfig(slug: string): Promise<PagesConfig | null> {
  const r = await gitExec(slug, ["show", "HEAD:.pages"]);
  if (r.exitCode !== 0) return null;
  return parsePagesConfig(r.stdout);
}

export async function getHeadSha(slug: string): Promise<string | null> {
  const r = await gitExec(slug, ["rev-parse", "--short=7", "HEAD"]);
  if (r.exitCode !== 0) return null;
  return r.stdout.trim();
}

function cachePath(slug: string, sha: string, filePath: string): string {
  return join(PAGES_CACHE_DIR, slug, sha, filePath);
}

function cacheDir(slug: string, sha: string): string {
  return join(PAGES_CACHE_DIR, slug, sha);
}

function slugCacheDir(slug: string): string {
  return join(PAGES_CACHE_DIR, slug);
}

export async function servePagesFile(
  slug: string,
  requestPath: string
): Promise<{ content: Buffer; mimeType: string } | null> {
  const config = await getPagesConfig(slug);
  if (!config) return null;

  const sha = await getHeadSha(slug);
  if (!sha) return null;

  // Normalize path
  let filePath = requestPath.replace(/^\/+/, "") || config.entry;

  // If path ends with / or has no extension, try as directory index
  if (filePath.endsWith("/") || filePath === "") {
    filePath = filePath + config.entry;
  }

  // Reject path traversal
  if (filePath.includes("..")) return null;

  // Build git path relative to configured directory
  const gitPath = config.directory === "."
    ? filePath
    : `${config.directory}/${filePath}`;

  // Check disk cache first
  const cached = cachePath(slug, sha, filePath);
  if (existsSync(cached)) {
    return {
      content: readFileSync(cached) as unknown as Buffer,
      mimeType: getMimeType(filePath),
    };
  }

  // Read from git
  const r = await gitExec(slug, ["show", `HEAD:${gitPath}`]);
  if (r.exitCode !== 0) {
    // SPA fallback: try path/index.html if no extension
    if (!filePath.includes(".")) {
      const spaPath = filePath.endsWith("/")
        ? filePath + config.entry
        : filePath + "/" + config.entry;
      const spaGitPath = config.directory === "."
        ? spaPath
        : `${config.directory}/${spaPath}`;
      const spaR = await gitExec(slug, ["show", `HEAD:${spaGitPath}`]);
      if (spaR.exitCode === 0) {
        writeToCache(cached.replace(filePath, spaPath), spaR.stdout);
        return {
          content: Buffer.from(spaR.stdout),
          mimeType: getMimeType(spaPath),
        };
      }
    }
    return null;
  }

  // Write to cache
  writeToCache(cached, r.stdout);

  return {
    content: Buffer.from(r.stdout),
    mimeType: getMimeType(filePath),
  };
}

function writeToCache(path: string, content: string): void {
  try {
    const dir = path.substring(0, path.lastIndexOf("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, content);
  } catch {
    // Cache write failure is non-fatal
  }
}

export async function invalidateCache(slug: string): Promise<void> {
  const dir = slugCacheDir(slug);
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // Cache cleanup failure is non-fatal
  }
}

const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  mjs: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  eot: "application/vnd.ms-fontobject",
  wasm: "application/wasm",
  map: "application/json",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
};

export function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  return MIME_TYPES[ext] || "application/octet-stream";
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/pages-service.test.ts`
Expected: PASS (all 8 tests)

**Step 5: Commit**

```bash
git add src/services/pages-service.ts tests/pages-service.test.ts
git commit -m "feat(pages): add pages service with TOML parser, git reader, and disk cache"
```

---

### Task 3: Create pages route handler

**Files:**
- Create: `src/routes/pages.ts`

**Step 1: Create the pages request handler**

Create `src/routes/pages.ts`:

```typescript
import { PAGES_DOMAIN } from "../config/env";
import { validateSlug } from "../git/paths";
import { repoExists } from "../git/read";
import { findRepoBySlug } from "../db/repos";
import { servePagesFile } from "../services/pages-service";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
};

export function extractPagesSlug(host: string): string | null {
  // host may include port, strip it
  const hostname = host.split(":")[0];
  if (!hostname.endsWith(`.${PAGES_DOMAIN}`)) return null;

  const slug = hostname.slice(0, -(PAGES_DOMAIN.length + 1));
  if (!slug || !validateSlug(slug)) return null;

  return slug;
}

export async function handlePagesRequest(request: Request): Promise<Response | undefined> {
  const host = request.headers.get("host") || "";
  const slug = extractPagesSlug(host);
  if (!slug) return undefined;

  // Only serve GET/HEAD
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: SECURITY_HEADERS,
    });
  }

  // Repo must exist and be public
  if (!repoExists(slug)) {
    return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
  }

  const repo = await findRepoBySlug(slug);
  if (!repo || !repo.is_public) {
    return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
  }

  const url = new URL(request.url);
  const result = await servePagesFile(slug, url.pathname);
  if (!result) {
    return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
  }

  return new Response(result.content, {
    status: 200,
    headers: {
      "Content-Type": result.mimeType,
      "Cache-Control": "public, max-age=60",
      ...SECURITY_HEADERS,
    },
  });
}
```

**Step 2: Commit**

```bash
git add src/routes/pages.ts
git commit -m "feat(pages): add pages subdomain request handler"
```

---

### Task 4: Wire pages handler into the request pipeline

**Files:**
- Modify: `src/index.ts:1-14` (imports)
- Modify: `src/index.ts:48-59` (fetch handler)

**Step 1: Add import to index.ts**

Add after line 9 (after skillRoute import):

```typescript
import { handlePagesRequest } from "./routes/pages";
```

**Step 2: Add pages handler in fetch(), before git handler**

Insert after the rate limiting check (after line 55) and before the git handler (line 58):

```typescript
    // Pages subdomain requests
    const pagesResponse = await handlePagesRequest(request);
    if (pagesResponse) return pagesResponse;
```

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(pages): wire pages handler into request pipeline"
```

---

### Task 5: Add cache invalidation on git push

**Files:**
- Modify: `src/routes/git.ts:51-63` (git-receive-pack handler)

**Step 1: Add import**

Add at top of `src/routes/git.ts`:

```typescript
import { invalidateCache } from "../services/pages-service";
```

**Step 2: Add cache invalidation after successful push**

In the `git-receive-pack` handler, after `touchRepo(slug).catch(() => {});` (line 61), add:

```typescript
      invalidateCache(slug).catch(() => {});
```

**Step 3: Commit**

```bash
git add src/routes/git.ts
git commit -m "feat(pages): invalidate pages cache on git push"
```

---

### Task 6: Ensure pages-cache directory is created at startup

**Files:**
- Modify: `src/services/repo-service.ts:9-12` (ensureDirectories)

**Step 1: Add import**

Add to imports in `src/services/repo-service.ts`:

```typescript
import { PAGES_CACHE_DIR } from "../config/env";
```

Wait — `REPOS_DIR` and `TRASH_DIR` are already imported from env. Just add `PAGES_CACHE_DIR` to that import.

**Step 2: Add mkdir in ensureDirectories**

Add inside `ensureDirectories()`:

```typescript
  await mkdir(PAGES_CACHE_DIR, { recursive: true });
```

**Step 3: Commit**

```bash
git add src/services/repo-service.ts
git commit -m "feat(pages): ensure pages-cache dir exists on startup"
```

---

### Task 7: Add pages-cache to .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: The `data/` line already covers it**

The current `.gitignore` has `data/` which already ignores `data/pages-cache/`. No change needed. Skip this task.

---

### Task 8: Write integration test for pages subdomain routing

**Files:**
- Create: `tests/pages-route.test.ts`

**Step 1: Write tests for extractPagesSlug**

```typescript
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
```

**Step 2: Run tests**

Run: `bun test tests/pages-route.test.ts`
Expected: PASS (all 6 tests)

**Step 3: Commit**

```bash
git add tests/pages-route.test.ts
git commit -m "test(pages): add unit tests for pages subdomain routing"
```

---

### Task 9: Add getMimeType tests

**Files:**
- Modify: `tests/pages-service.test.ts` (add test block)

**Step 1: Add MIME type tests**

Add to `tests/pages-service.test.ts`:

```typescript
import { getMimeType } from "../src/services/pages-service";

describe("getMimeType", () => {
  test("returns correct type for html", () => {
    expect(getMimeType("index.html")).toBe("text/html; charset=utf-8");
  });

  test("returns correct type for css", () => {
    expect(getMimeType("styles.css")).toBe("text/css; charset=utf-8");
  });

  test("returns correct type for js", () => {
    expect(getMimeType("app.js")).toBe("application/javascript; charset=utf-8");
  });

  test("returns correct type for wasm", () => {
    expect(getMimeType("game.wasm")).toBe("application/wasm");
  });

  test("returns octet-stream for unknown extensions", () => {
    expect(getMimeType("data.xyz")).toBe("application/octet-stream");
  });

  test("handles nested paths", () => {
    expect(getMimeType("assets/images/logo.png")).toBe("image/png");
  });
});
```

**Step 2: Run all tests**

Run: `bun test`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add tests/pages-service.test.ts
git commit -m "test(pages): add MIME type detection tests"
```

---

### Task 10: Manual verification

**Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass

**Step 2: Verify the app starts**

Run: `bun run src/index.ts` (check for startup errors, then Ctrl+C)
Expected: `crustyhub running at http://0.0.0.0:3000`

**Step 3: Final commit with any fixes**

If any issues found, fix and commit.
