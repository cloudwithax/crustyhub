# Git Data in PostgreSQL Design

## Problem

Git repo data lives on the Docker container's filesystem volume. When the container is redeployed or the volume is lost, all repo data disappears even though the PostgreSQL database (on a separate server) retains the metadata records. This leaves orphaned DB rows pointing at missing directories, returning 500 errors.

## Solution

Store each bare git repo as a tar.gz binary bundle in PostgreSQL. The filesystem remains the working copy that `git-http-backend` operates on, but the DB becomes the single source of truth. On container startup, any missing repos are restored from the DB automatically.

## Constraints

- Repos are small (< 50MB each)
- `git-http-backend` requires real filesystem paths (cannot be replaced)
- Must not break existing push/pull/clone flows

## Data Model

New table `repo_bundles`:

```sql
CREATE TABLE IF NOT EXISTS repo_bundles (
  id BIGSERIAL PRIMARY KEY,
  repo_id BIGINT NOT NULL UNIQUE REFERENCES repos(id) ON DELETE CASCADE,
  bundle BYTEA NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

One row per repo. The `bundle` column holds a tar.gz of the entire `<slug>.git/` bare repo directory. `size_bytes` enables quick size checks without loading the blob.

## Lifecycle

### Push completion

After `git-receive-pack` succeeds in `handleGitHttp`:

1. Tar.gz the bare repo directory
2. Upsert into `repo_bundles` (INSERT ON CONFLICT UPDATE)
3. Fire-and-forget (don't block the push response)

### Server startup

New `restoreRepos()` function called after `ensureDirectories()`:

1. Query `repo_bundles` joined with `repos` (where `deleted_at IS NULL`)
2. For each bundle where the filesystem directory is missing, extract tar.gz to `REPOS_DIR`
3. Log restored repos

### Repo creation

No bundle created until first push delivers actual data.

### Repo deletion

Explicitly delete the `repo_bundles` row in `deleteRepo()` alongside the soft-delete. (`ON DELETE CASCADE` won't fire on soft delete since the `repos` row isn't actually deleted.)

### Fork

After `git clone --bare` completes, immediately bundle the new repo.

## Files Changed

| File | Change |
|------|--------|
| `src/db/index.ts` | Add `repo_bundles` table in `initDb()` |
| `src/db/repos.ts` | Add `saveBundle()`, `getBundle()`, `deleteBundle()` |
| `src/services/repo-service.ts` | Add `bundleRepo()`, `restoreRepos()`, update `deleteRepo()`, `forkRepo()` |
| `src/routes/git.ts` | Call `bundleRepo()` after push |
| `src/index.ts` | Call `restoreRepos()` on startup |

## Files Unchanged

- `src/git/http-backend.ts` - still operates on filesystem
- `src/git/read.ts` - all git reads still via `gitExec` on filesystem
- `src/git/git-spawn.ts` - unchanged
- `src/git/paths.ts` - unchanged
- `src/routes/repo.ts` - web UI unchanged
- `src/services/pages-service.ts` - pages cache unchanged
