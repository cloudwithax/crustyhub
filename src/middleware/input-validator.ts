import {
  MAX_DESCRIPTION_LENGTH,
  MAX_ISSUE_TITLE_LENGTH,
  MAX_ISSUE_BODY_LENGTH,
  MAX_AUTHOR_LENGTH,
  MAX_SEARCH_QUERY_LENGTH,
} from "../config/env";

export interface ValidationError {
  field: string;
  message: string;
}

function stripControlChars(s: string): string {
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").replace(/\s+/g, " ").trim();
}

export function validateDescription(value: string | undefined): { clean: string; error?: string } {
  if (!value) return { clean: "" };
  const clean = value.trim();
  if (clean.length > MAX_DESCRIPTION_LENGTH) {
    return { clean, error: `description must be ${MAX_DESCRIPTION_LENGTH} characters or less` };
  }
  return { clean };
}

export function validateIssueTitle(value: string | undefined): { clean: string; error?: string } {
  if (!value || !value.trim()) {
    return { clean: "", error: "title is required" };
  }
  const clean = value.trim();
  if (clean.length > MAX_ISSUE_TITLE_LENGTH) {
    return { clean, error: `title must be ${MAX_ISSUE_TITLE_LENGTH} characters or less` };
  }
  return { clean };
}

export function validateIssueBody(value: string | undefined): { clean: string; error?: string } {
  if (!value) return { clean: "" };
  const clean = value.trim();
  if (clean.length > MAX_ISSUE_BODY_LENGTH) {
    return { clean, error: `body must be ${MAX_ISSUE_BODY_LENGTH} characters or less` };
  }
  return { clean };
}

export function validateAuthor(value: string | undefined): { clean: string } {
  if (!value) return { clean: "anonymous" };
  const clean = stripControlChars(value);
  if (clean.length === 0) return { clean: "anonymous" };
  if (clean.length > MAX_AUTHOR_LENGTH) return { clean: clean.slice(0, MAX_AUTHOR_LENGTH) };
  return { clean };
}

export function validateSearchQuery(value: string | undefined): { clean: string; error?: string } {
  if (!value) return { clean: "" };
  const clean = value.trim();
  if (clean.length > MAX_SEARCH_QUERY_LENGTH) {
    return { clean, error: `search query must be ${MAX_SEARCH_QUERY_LENGTH} characters or less` };
  }
  return { clean };
}

export function validateForkName(value: string | undefined): { clean: string; error?: string } {
  if (!value || !value.trim()) {
    return { clean: "", error: "fork name is required" };
  }
  return { clean: value.trim() };
}
