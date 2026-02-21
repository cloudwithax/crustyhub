import {
  SPAM_BLOCK_THRESHOLD,
  SPAM_BAN_THRESHOLD,
  SPAM_BAN_DURATION_MS,
  SPAM_WINDOW_MS,
  BANNED_CONTENT_PATTERNS,
} from "../config/env";

interface SpamRecord {
  score: number;
  lastUpdate: number;
  writeTimestamps: number[];
  contentHashes: Map<string, number>;
}

const records = new Map<string, SpamRecord>();
const bans = new Map<string, number>();

const bannedRegexes: RegExp[] = BANNED_CONTENT_PATTERNS
  .filter((p) => p.length > 0)
  .map((p) => new RegExp(p, "i"));

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of records) {
    if (now - record.lastUpdate > SPAM_WINDOW_MS * 2) {
      records.delete(ip);
    }
  }
  for (const [ip, expiry] of bans) {
    if (now > expiry) {
      bans.delete(ip);
    }
  }
}, 5 * 60 * 1000);

function getRecord(ip: string): SpamRecord {
  let record = records.get(ip);
  if (!record) {
    record = {
      score: 0,
      lastUpdate: Date.now(),
      writeTimestamps: [],
      contentHashes: new Map(),
    };
    records.set(ip, record);
  }
  return record;
}

function decayScore(record: SpamRecord): void {
  const now = Date.now();
  const elapsedMinutes = (now - record.lastUpdate) / 60_000;
  if (elapsedMinutes >= 1) {
    record.score = Math.max(0, record.score - Math.floor(elapsedMinutes));
    record.lastUpdate = now;
  }
}

function simpleHash(text: string): string {
  const sample = text.slice(0, 200);
  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    const char = sample.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}

function countUrls(text: string): number {
  const urlPattern = /https?:\/\/[^\s)]+/gi;
  const matches = text.match(urlPattern);
  return matches ? matches.length : 0;
}

export function isBanned(ip: string): Response | null {
  const expiry = bans.get(ip);
  if (expiry && Date.now() < expiry) {
    const retryAfter = Math.ceil((expiry - Date.now()) / 1000);
    return new Response(
      JSON.stringify({ error: "temporarily banned due to abuse", retryAfter }),
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

export function checkBannedPatterns(...texts: string[]): Response | null {
  if (bannedRegexes.length === 0) return null;

  for (const text of texts) {
    for (const regex of bannedRegexes) {
      if (regex.test(text)) {
        return new Response(
          JSON.stringify({ error: "content matches a banned pattern" }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          }
        );
      }
    }
  }
  return null;
}

export function scoreWriteRequest(
  ip: string,
  content: { title?: string; body?: string; description?: string }
): Response | null {
  const record = getRecord(ip);
  decayScore(record);

  const now = Date.now();

  record.writeTimestamps = record.writeTimestamps.filter((t) => now - t < 30_000);
  record.writeTimestamps.push(now);

  if (record.score === 0) {
    record.contentHashes.clear();
  }

  if (record.writeTimestamps.length > 5) {
    record.score += 3;
  }

  const text = [content.title || "", content.body || "", content.description || ""].join(" ").trim();
  if (text.length > 0) {
    const hash = simpleHash(text);
    const hashCount = (record.contentHashes.get(hash) || 0) + 1;
    record.contentHashes.set(hash, hashCount);
    if (hashCount >= 3) {
      record.score += 5;
    }
  }

  const fullText = [content.title || "", content.body || ""].join(" ");
  if (content.title && content.title === content.title.toUpperCase() && content.title.length > 10) {
    record.score += 3;
  }
  if (countUrls(fullText) > 10) {
    record.score += 3;
  }

  if (text.replace(/\s/g, "").length < 5 && text.length > 0) {
    record.score += 1;
  }

  record.lastUpdate = now;

  if (record.score >= SPAM_BAN_THRESHOLD) {
    bans.set(ip, now + SPAM_BAN_DURATION_MS);
    records.delete(ip);
    return new Response(
      JSON.stringify({ error: "temporarily banned due to suspected automated abuse" }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(Math.ceil(SPAM_BAN_DURATION_MS / 1000)),
        },
      }
    );
  }

  if (record.score >= SPAM_BLOCK_THRESHOLD) {
    return new Response(
      JSON.stringify({ error: "slow down \u2014 suspected automated abuse" }),
      {
        status: 429,
        headers: { "content-type": "application/json" },
      }
    );
  }

  return null;
}
