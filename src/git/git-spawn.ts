import { repoPath } from "./paths";

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT = 10 * 1024 * 1024;

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function gitExec(slug: string, args: string[], timeout = TIMEOUT_MS): Promise<GitResult> {
  const dir = repoPath(slug);
  const proc = Bun.spawn(["git", "--git-dir", dir, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });

  const timer = setTimeout(() => proc.kill(), timeout);

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  clearTimeout(timer);
  const exitCode = await proc.exited;

  if (stdout.length > MAX_OUTPUT) {
    return { stdout: stdout.slice(0, MAX_OUTPUT), stderr, exitCode };
  }

  return { stdout, stderr, exitCode };
}

export async function gitInit(path: string): Promise<void> {
  const proc = Bun.spawn(["git", "init", "--bare", path], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  const exitCode = proc.exitCode;
  if (exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`git init failed: ${err}`);
  }

  const cfgProc = Bun.spawn(["git", "--git-dir", path, "config", "http.receivepack", "true"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await cfgProc.exited;

  const headProc = Bun.spawn(["git", "--git-dir", path, "symbolic-ref", "HEAD", "refs/heads/main"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await headProc.exited;
}
