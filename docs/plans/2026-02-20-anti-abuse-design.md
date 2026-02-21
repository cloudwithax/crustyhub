# Anti-Abuse Mechanisms Design

**Date:** 2026-02-20
**Approach:** Distributed Guards — protection at each layer rather than a single middleware

## Context

CrustyHub is an anonymous git hosting platform with zero authentication. It currently has slug validation, HTML escaping, and markdown sanitization, but no rate limiting, size caps, spam detection, or CSRF protection. Deployed behind a reverse proxy that handles TLS and basic DDoS.

## Constraints

- Fully anonymous — no accounts, no API keys
- In-memory state (resets on restart, acceptable behind reverse proxy)
- No new external dependencies (no Redis, no external services)
- All configurable via environment/config

---

## 1. Rate Limiter Middleware

**File:** `src/middleware/rate-limiter.ts`

IP-based sliding window rate limiter registered as an Elysia plugin. Extracts IP from `X-Forwarded-For` header (reverse proxy), fallback to connection IP.

### Tiered Limits

| Category | Window | Max Requests | Applies To |
|----------|--------|-------------|------------|
| Read | 1 min | 120 | GET routes (browsing, search) |
| Write | 1 min | 20 | POST routes (create repo, issues, comments) |
| Git Read | 1 min | 30 | git-upload-pack (clone/fetch) |
| Git Write | 1 min | 10 | git-receive-pack (push) |

### Behavior

- Returns `429 Too Many Requests` with `Retry-After` header on limit exceeded
- Stale entries auto-cleaned every 5 minutes
- Limits configurable via `src/config/env.ts`

---

## 2. Input Validation in Route Handlers

**File:** `src/middleware/input-validator.ts`

Reusable validation functions called from each route handler that accepts user input.

### Length Caps

| Field | Max Length |
|-------|-----------|
| Repo slug | 63 chars (already enforced) |
| Repo description | 500 chars |
| Issue title | 300 chars |
| Issue/comment body (markdown) | 50,000 chars |
| Author name | 100 chars |
| Search query | 200 chars |
| Fork name | 63 chars |

### Rules

- All text fields trimmed and length-checked before DB operations
- Reject with `400 Bad Request` and user-friendly error message
- Validate `Content-Type` on POST requests (must be `application/x-www-form-urlencoded` for form routes)
- Author names: strip control characters, collapse whitespace

### Applied In

- `src/routes/home.ts` — repo creation, search
- `src/routes/repo.ts` — settings, fork, delete
- `src/routes/issues.ts` — issue creation, comments

---

## 3. Git Backend Size & Resource Limits

**File:** `src/middleware/git-guard.ts`

### Push Size Limits

- Max push payload: 100 MB per push
- Enforced via `Content-Length` header on `git-receive-pack` POST
- Chunked transfers: stream with byte counter, kill process + return `413` if exceeded

### Repo Quotas (per IP, in-memory)

- Max repos created per IP per hour: 10 (web creation + push-to-create)
- Tracked in `Map<string, { count, windowStart }>`

### Git Operation Safeguards

- Kill `git-http-backend` subprocess if it exceeds 60 seconds
- Limit concurrent git operations per IP to 3
- Existing 30s command timeout and 10 MB output cap preserved

### Disk Space Awareness

- Before push-to-create: check available disk space via `statfs`
- Free space < 1 GB: reject new repo creation with `503 Service Unavailable`
- Existing repos can still receive pushes

---

## 4. Content Abuse & Spam Detection

**File:** `src/middleware/spam-detector.ts`

Behavioral scoring per IP over a rolling 10-minute window.

### Scoring Signals

| Signal | Points | Description |
|--------|--------|-------------|
| Repeated identical content | +5 | Same title/body submitted multiple times |
| Rapid-fire writes | +3 | >5 write operations in 30 seconds |
| Suspicious patterns | +3 | >10 URLs in body, all-caps title |
| Empty/minimal content | +1 | <5 characters of actual text |

### Thresholds

- Score >= 10: Block request with `429`, message "Slow down — suspected automated abuse"
- Score >= 20: Temporary IP ban for 15 minutes on all write endpoints
- Scores decay: -1 point per minute

### Content Fingerprinting

- Hash first 200 chars of submitted content
- Track recent hashes per IP — 3+ identical hashes in 10 minutes = duplicate spam

### Banned Content Patterns

- Configurable regex list in `src/config/env.ts`
- Checked against issue titles, bodies, comments, repo descriptions
- Default: empty list (admin populates as needed)

### Applied In

- Write route handlers in `issues.ts`, `home.ts`, `repo.ts`

---

## 5. CSRF Protection

**File:** `src/middleware/csrf.ts`

### Mechanism

- Generate random CSRF token per session (in-memory `Map<sessionId, token>`)
- Inject hidden `<input name="_csrf" value="...">` into all HTML forms
- On POST: validate `_csrf` matches session's stored token
- Reject mismatches with `403 Forbidden`

### Token Lifecycle

- Created on first GET that renders a form
- Tied to existing `crustyhub_session` cookie
- Expires after 24 hours of inactivity

### Exempt Endpoints

- Git smart HTTP routes (machine-to-machine)
- `/skill.md` GET endpoint

### Applied As

- Elysia `beforeHandle` hook on all POST routes except git endpoints

---

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `src/middleware/rate-limiter.ts` | IP-based sliding window rate limiter |
| `src/middleware/input-validator.ts` | Reusable length/format validation functions |
| `src/middleware/git-guard.ts` | Push size, repo quotas, concurrent ops, disk space |
| `src/middleware/spam-detector.ts` | Behavioral scoring, fingerprinting, temp bans |
| `src/middleware/csrf.ts` | CSRF token generation and validation |

### Modified Files

| File | Changes |
|------|---------|
| `src/index.ts` | Register rate limiter and CSRF as Elysia plugins |
| `src/config/env.ts` | Add configurable limits |
| `src/routes/home.ts` | Input validation + spam detection |
| `src/routes/repo.ts` | Input validation + spam detection |
| `src/routes/issues.ts` | Input validation + spam detection |
| `src/git/http-backend.ts` | Git-guard integration (size, concurrency, timeout) |
| `src/services/repo-service.ts` | Git-guard integration (quotas, disk space) |
| `src/views/layout.ts` | CSRF helper for form rendering |
| `src/views/pages/*.ts` | Hidden CSRF input in all forms |

### Request Flow

```
Request -> Rate Limiter -> CSRF Check (POST only) -> Route Handler -> Input Validator -> Spam Detector -> DB/Git
                                                                          |
                                                                     Git Guard (for git routes)
```

No new dependencies.
