import { statfs } from "fs/promises";
import {
  MAX_PUSH_SIZE_BYTES,
  MAX_REPOS_PER_IP_PER_HOUR,
  MAX_CONCURRENT_GIT_OPS_PER_IP,
  MIN_FREE_DISK_BYTES,
  REPOS_DIR,
} from "../config/env";

// --- Repo creation quota ---
interface QuotaBucket {
  count: number;
  windowStart: number;
}

const repoQuotas = new Map<string, QuotaBucket>();
const HOUR_MS = 60 * 60 * 1000;

// Clean stale quota entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of repoQuotas) {
    if (now - bucket.windowStart > HOUR_MS * 2) {
      repoQuotas.delete(key);
    }
  }
}, 10 * 60 * 1000);

export function checkRepoCreationQuota(ip: string): Response | null {
  const now = Date.now();
  const bucket = repoQuotas.get(ip);

  if (!bucket || now - bucket.windowStart > HOUR_MS) {
    repoQuotas.set(ip, { count: 1, windowStart: now });
    return null;
  }

  bucket.count++;

  if (bucket.count > MAX_REPOS_PER_IP_PER_HOUR) {
    return new Response(
      JSON.stringify({ error: "repo creation limit exceeded", limit: MAX_REPOS_PER_IP_PER_HOUR, window: "1 hour" }),
      {
        status: 429,
        headers: { "content-type": "application/json" },
      }
    );
  }

  return null;
}

// --- Push size check ---
export function checkPushSize(request: Request): Response | null {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > MAX_PUSH_SIZE_BYTES) {
      return new Response(
        JSON.stringify({
          error: "push payload too large",
          maxMB: MAX_PUSH_SIZE_BYTES / (1024 * 1024),
        }),
        {
          status: 413,
          headers: { "content-type": "application/json" },
        }
      );
    }
  }
  return null;
}

export function createSizeLimitedStream(
  input: ReadableStream<Uint8Array>,
  onExceeded: () => void
): ReadableStream<Uint8Array> {
  let totalBytes = 0;
  const reader = input.getReader();

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      totalBytes += value.byteLength;
      if (totalBytes > MAX_PUSH_SIZE_BYTES) {
        onExceeded();
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    cancel() {
      reader.cancel();
    },
  });
}

// --- Concurrent git ops per IP ---
const concurrentOps = new Map<string, number>();

export function acquireGitOp(ip: string): Response | null {
  const current = concurrentOps.get(ip) || 0;
  if (current >= MAX_CONCURRENT_GIT_OPS_PER_IP) {
    return new Response(
      JSON.stringify({ error: "too many concurrent git operations" }),
      {
        status: 429,
        headers: { "content-type": "application/json" },
      }
    );
  }
  concurrentOps.set(ip, current + 1);
  return null;
}

export function releaseGitOp(ip: string): void {
  const current = concurrentOps.get(ip) || 1;
  if (current <= 1) {
    concurrentOps.delete(ip);
  } else {
    concurrentOps.set(ip, current - 1);
  }
}

// --- Disk space check ---
export async function checkDiskSpace(): Promise<Response | null> {
  try {
    const stats = await statfs(REPOS_DIR);
    const freeBytes = stats.bfree * stats.bsize;
    if (freeBytes < MIN_FREE_DISK_BYTES) {
      return new Response(
        JSON.stringify({ error: "server disk space critically low, cannot create new repos" }),
        {
          status: 503,
          headers: { "content-type": "application/json" },
        }
      );
    }
  } catch {
    // If statfs fails, allow the operation
  }
  return null;
}
