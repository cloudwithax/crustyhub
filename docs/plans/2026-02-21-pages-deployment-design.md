# CrustyHub Pages - Design Document

## Overview

Auto-deploy static sites from repositories to subdomains. When a repo contains a `.pages` config file, its static content is served at `<slug>.pages.crustyhub.xyz`.

## Requirements

- Repos with a `.pages` TOML config get a pages subdomain automatically
- Subdomain maps directly to repo slug: `hockey-game` → `hockey-game.pages.crustyhub.xyz`
- Static-only serving, no build step
- Wildcard subdomains already enabled on the host

## Architecture: Hybrid Git Read + Disk Cache

### Request Flow

```
Request to hockey-game.pages.crustyhub.xyz/game.js
  → Parse Host header, extract "hockey-game" from *.pages.crustyhub.xyz
  → Look up repo "hockey-game" in DB (must exist, be public, have .pages config)
  → Check disk cache: data/pages-cache/<slug>/<commit-sha>/game.js
    → HIT: serve from disk with correct MIME type
    → MISS: git show HEAD:<directory>/game.js → write to cache → serve
  → If file not found and path has no extension, try path/index.html (SPA fallback)
  → 404 if nothing matches
```

Subdomain check happens before the Elysia router in `index.ts`, same pattern as git request interception.

### `.pages` Config Format

```toml
# .pages (TOML in repo root)
[pages]
directory = "."        # which directory to serve (relative to repo root)
entry = "index.html"   # default file for directory requests
```

Both fields optional, defaults to `directory = "."` and `entry = "index.html"`.

### Cache Strategy

**Location:** `data/pages-cache/<slug>/<commit-sha-7>/<path>`

**Population:** On cache miss, read file via `git show HEAD:<dir>/<path>`, write to disk cache, serve.

**Invalidation:** After successful `git-receive-pack`:
1. Check if repo has `.pages` file via `git show HEAD:.pages`
2. Get new HEAD commit SHA
3. Delete old cache directories for this slug (any SHA that doesn't match current)
4. Optionally pre-warm entry file

### Subdomain Detection

New env var: `PAGES_DOMAIN` (default: `pages.crustyhub.xyz`)

In request handler, check `Host` header:
- If host ends with `.<PAGES_DOMAIN>`, extract prefix as repo slug
- Route to pages handler
- Otherwise, fall through to normal Elysia routing

### MIME Types

Extend existing MIME map to cover: html, js, css, json, wasm, png, jpg, gif, svg, ico, woff, woff2, ttf, eot, mp3, mp4, webm, webp, pdf, xml, txt, map.

### Security

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- No CSRF needed (GET-only)
- Rate limiting via existing `read` category
- Only public repos served
- Path traversal prevention (reject `..` in paths)

### No Database Changes

The `.pages` file in the repo is the config source of truth. Existing `repos` table provides slug and visibility. No new tables needed.

## Files to Create/Modify

1. `src/config/env.ts` - Add `PAGES_DOMAIN` env var
2. `src/services/pages-service.ts` - New: pages config parsing, file serving, cache management
3. `src/routes/pages.ts` - New: pages request handler
4. `src/index.ts` - Add subdomain detection before Elysia routing
5. `src/git/http-backend.ts` or `src/routes/git.ts` - Add cache invalidation after push
6. `.gitignore` - Add `data/pages-cache/`
