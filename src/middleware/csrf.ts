import { randomBytes } from "crypto";

interface CsrfEntry {
  token: string;
  lastAccess: number;
}

const tokens = new Map<string, CsrfEntry>();
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Clean expired tokens every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, entry] of tokens) {
    if (now - entry.lastAccess > TOKEN_TTL_MS) {
      tokens.delete(sessionId);
    }
  }
}, 10 * 60 * 1000);

export function getOrCreateCsrfToken(sessionId: string): string {
  const existing = tokens.get(sessionId);
  if (existing) {
    existing.lastAccess = Date.now();
    return existing.token;
  }

  const token = randomBytes(32).toString("hex");
  tokens.set(sessionId, { token, lastAccess: Date.now() });
  return token;
}

export function validateCsrfToken(sessionId: string, token: string | undefined): boolean {
  if (!token) return false;
  const entry = tokens.get(sessionId);
  if (!entry) return false;
  return entry.token === token;
}

export function csrfHiddenInput(token: string): string {
  return `<input type="hidden" name="_csrf" value="${token}">`;
}

export function csrfErrorResponse(): Response {
  return new Response(
    JSON.stringify({ error: "CSRF token invalid or missing. Please reload the page and try again." }),
    {
      status: 403,
      headers: { "content-type": "application/json" },
    }
  );
}
