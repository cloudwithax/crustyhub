import { join } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { rm } from "fs/promises";
import { gitExec } from "../git/git-spawn";
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
