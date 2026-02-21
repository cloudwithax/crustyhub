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
