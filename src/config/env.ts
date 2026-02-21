import { join } from "path";

export const PORT = parseInt(process.env.PORT || "3000", 10);
export const HOST = process.env.HOST || "0.0.0.0";
export const DATABASE_URL = process.env.DATABASE_URL || "postgres://crustyhub:crustyhub@localhost:5432/crustyhub";
export const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
export const REPOS_DIR = join(DATA_DIR, "repos");
export const TRASH_DIR = join(DATA_DIR, "trash");
export const GIT_HTTP_BACKEND = process.env.GIT_HTTP_BACKEND || "/usr/lib/git-core/git-http-backend";
export const BASE_URL = process.env.BASE_URL || `https://crustyhub.xyz`;

// --- Anti-abuse configuration ---

// Rate limits: [max requests, window in ms]
export const RATE_LIMIT_READ: [number, number] = [
  parseInt(process.env.RATE_LIMIT_READ_MAX || "120", 10),
  parseInt(process.env.RATE_LIMIT_READ_WINDOW || "60000", 10),
];
export const RATE_LIMIT_WRITE: [number, number] = [
  parseInt(process.env.RATE_LIMIT_WRITE_MAX || "20", 10),
  parseInt(process.env.RATE_LIMIT_WRITE_WINDOW || "60000", 10),
];
export const RATE_LIMIT_GIT_READ: [number, number] = [
  parseInt(process.env.RATE_LIMIT_GIT_READ_MAX || "30", 10),
  parseInt(process.env.RATE_LIMIT_GIT_READ_WINDOW || "60000", 10),
];
export const RATE_LIMIT_GIT_WRITE: [number, number] = [
  parseInt(process.env.RATE_LIMIT_GIT_WRITE_MAX || "10", 10),
  parseInt(process.env.RATE_LIMIT_GIT_WRITE_WINDOW || "60000", 10),
];

// Input limits
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_ISSUE_TITLE_LENGTH = 300;
export const MAX_ISSUE_BODY_LENGTH = 50_000;
export const MAX_AUTHOR_LENGTH = 100;
export const MAX_SEARCH_QUERY_LENGTH = 200;

// Git guard
export const MAX_PUSH_SIZE_BYTES = parseInt(process.env.MAX_PUSH_SIZE_MB || "100", 10) * 1024 * 1024;
export const MAX_REPOS_PER_IP_PER_HOUR = parseInt(process.env.MAX_REPOS_PER_IP_PER_HOUR || "10", 10);
export const MAX_CONCURRENT_GIT_OPS_PER_IP = parseInt(process.env.MAX_CONCURRENT_GIT_OPS || "3", 10);
export const GIT_BACKEND_TIMEOUT_MS = parseInt(process.env.GIT_BACKEND_TIMEOUT_MS || "60000", 10);
export const MIN_FREE_DISK_BYTES = parseInt(process.env.MIN_FREE_DISK_GB || "1", 10) * 1024 * 1024 * 1024;

// Spam detection
export const SPAM_BLOCK_THRESHOLD = 10;
export const SPAM_BAN_THRESHOLD = 20;
export const SPAM_BAN_DURATION_MS = 15 * 60 * 1000;
export const SPAM_WINDOW_MS = 10 * 60 * 1000;
export const BANNED_CONTENT_PATTERNS: string[] = process.env.BANNED_PATTERNS
  ? process.env.BANNED_PATTERNS.split(",").map((p) => p.trim())
  : [];
