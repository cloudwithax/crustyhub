import {
  RATE_LIMIT_READ,
  RATE_LIMIT_WRITE,
  RATE_LIMIT_GIT_READ,
  RATE_LIMIT_GIT_WRITE,
} from "../config/env";

interface RateBucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, RateBucket>();

// Clean stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    const windowMs = getWindowForCategory(key.split(":")[0]);
    if (now - bucket.windowStart > windowMs * 2) {
      buckets.delete(key);
    }
  }
}, 5 * 60 * 1000);

function getWindowForCategory(category: string): number {
  switch (category) {
    case "read": return RATE_LIMIT_READ[1];
    case "write": return RATE_LIMIT_WRITE[1];
    case "git-read": return RATE_LIMIT_GIT_READ[1];
    case "git-write": return RATE_LIMIT_GIT_WRITE[1];
    default: return 60_000;
  }
}

function getLimitForCategory(category: string): number {
  switch (category) {
    case "read": return RATE_LIMIT_READ[0];
    case "write": return RATE_LIMIT_WRITE[0];
    case "git-read": return RATE_LIMIT_GIT_READ[0];
    case "git-write": return RATE_LIMIT_GIT_WRITE[0];
    default: return 120;
  }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export type RateCategory = "read" | "write" | "git-read" | "git-write";

export function classifyRequest(method: string, path: string): RateCategory {
  if (path.includes(".git/")) {
    if (path.endsWith("/git-receive-pack")) return "git-write";
    if (path.endsWith("/info/refs")) {
      return "git-read";
    }
    return "git-read";
  }
  if (method === "POST") return "write";
  return "read";
}

export function checkRateLimit(ip: string, category: RateCategory): Response | null {
  const key = `${category}:${ip}`;
  const now = Date.now();
  const windowMs = getWindowForCategory(category);
  const maxRequests = getLimitForCategory(category);

  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return null;
  }

  bucket.count++;

  if (bucket.count > maxRequests) {
    const retryAfter = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
    return new Response(
      JSON.stringify({ error: "rate limit exceeded", retryAfter }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(retryAfter),
        },
      }
    );
  }

  return null;
}
