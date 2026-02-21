import { gitExec } from "./git-spawn";
import { repoPath } from "./paths";
import { existsSync } from "fs";

export interface TreeEntry {
  mode: string;
  type: "blob" | "tree" | "commit";
  hash: string;
  size: string;
  name: string;
}

export interface CommitInfo {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  date: string;
  subject: string;
}

export interface BranchInfo {
  name: string;
  hash: string;
  date: string;
  subject: string;
}

export function repoExists(slug: string): boolean {
  return existsSync(repoPath(slug));
}

export async function getDefaultBranch(slug: string): Promise<string> {
  const r = await gitExec(slug, ["symbolic-ref", "--short", "HEAD"]);
  if (r.exitCode === 0 && r.stdout.trim()) return r.stdout.trim();
  const branches = await listBranches(slug);
  if (branches.length > 0) return branches[0].name;
  return "main";
}

export async function listBranches(slug: string): Promise<BranchInfo[]> {
  const r = await gitExec(slug, [
    "for-each-ref",
    "--format=%(refname:short)\t%(objectname:short)\t%(committerdate:iso8601)\t%(subject)",
    "refs/heads",
  ]);
  if (r.exitCode !== 0 || !r.stdout.trim()) return [];
  return r.stdout.trim().split("\n").map((line) => {
    const [name, hash, date, ...rest] = line.split("\t");
    return { name, hash, date, subject: rest.join("\t") };
  });
}

export async function listTags(slug: string): Promise<BranchInfo[]> {
  const r = await gitExec(slug, [
    "for-each-ref",
    "--format=%(refname:short)\t%(objectname:short)\t%(creatordate:iso8601)\t%(subject)",
    "--sort=-creatordate",
    "refs/tags",
  ]);
  if (r.exitCode !== 0 || !r.stdout.trim()) return [];
  return r.stdout.trim().split("\n").map((line) => {
    const [name, hash, date, ...rest] = line.split("\t");
    return { name, hash, date, subject: rest.join("\t") };
  });
}

export async function listTree(slug: string, ref: string, path = ""): Promise<TreeEntry[]> {
  const treeish = path ? `${ref}:${path}` : ref;
  const r = await gitExec(slug, ["ls-tree", "-l", treeish]);
  if (r.exitCode !== 0 || !r.stdout.trim()) return [];
  return r.stdout.trim().split("\n").map((line) => {
    const match = line.match(/^(\d+)\s+(blob|tree|commit)\s+([a-f0-9]+)\s+(-|\d+)\s+(.+)$/);
    if (!match) return null;
    return {
      mode: match[1],
      type: match[2] as "blob" | "tree" | "commit",
      hash: match[3],
      size: match[4],
      name: match[5],
    };
  }).filter(Boolean) as TreeEntry[];
}

export async function getBlob(slug: string, ref: string, path: string): Promise<string | null> {
  const r = await gitExec(slug, ["show", `${ref}:${path}`]);
  if (r.exitCode !== 0) return null;
  return r.stdout;
}

export async function getCommitLog(slug: string, ref: string, limit = 50, path?: string): Promise<CommitInfo[]> {
  const args = [
    "log",
    "--format=%H\t%P\t%an\t%ae\t%aI\t%s",
    `-n`, `${limit}`,
    ref,
  ];
  if (path) args.push("--", path);
  const r = await gitExec(slug, args);
  if (r.exitCode !== 0 || !r.stdout.trim()) return [];
  return r.stdout.trim().split("\n").map((line) => {
    const [hash, parents, author, email, date, ...rest] = line.split("\t");
    return {
      hash,
      parents: parents ? parents.split(" ") : [],
      author,
      email,
      date,
      subject: rest.join("\t"),
    };
  });
}

export async function getCommitDetail(slug: string, sha: string): Promise<{ info: CommitInfo; diff: string } | null> {
  const infoR = await gitExec(slug, ["log", "--format=%H\t%P\t%an\t%ae\t%aI\t%s", "-n", "1", sha]);
  if (infoR.exitCode !== 0 || !infoR.stdout.trim()) return null;

  const [hash, parents, author, email, date, ...rest] = infoR.stdout.trim().split("\t");
  const info: CommitInfo = {
    hash,
    parents: parents ? parents.split(" ") : [],
    author,
    email,
    date,
    subject: rest.join("\t"),
  };

  const diffR = await gitExec(slug, ["diff-tree", "--no-color", "-p", "--stat", sha]);
  return { info, diff: diffR.stdout };
}

export async function getReadme(slug: string, ref: string): Promise<{ name: string; content: string } | null> {
  const tree = await listTree(slug, ref);
  const readmeEntry = tree.find((e) =>
    e.type === "blob" && /^readme(\.(md|txt|rst|org))?$/i.test(e.name)
  );
  if (!readmeEntry) return null;
  const content = await getBlob(slug, ref, readmeEntry.name);
  if (!content) return null;
  return { name: readmeEntry.name, content };
}

export async function hasAnyCommits(slug: string): Promise<boolean> {
  const r = await gitExec(slug, ["rev-list", "--count", "--all", "-n", "1"]);
  return r.exitCode === 0 && parseInt(r.stdout.trim(), 10) > 0;
}

export async function resolveRef(slug: string, ref: string): Promise<string | null> {
  const r = await gitExec(slug, ["rev-parse", "--verify", ref]);
  if (r.exitCode !== 0) return null;
  return r.stdout.trim();
}
