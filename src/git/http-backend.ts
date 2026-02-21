import { REPOS_DIR, GIT_HTTP_BACKEND } from "../config/env";
import { GIT_BACKEND_TIMEOUT_MS } from "../config/env";

export async function handleGitRequest(
  method: string,
  pathInfo: string,
  queryString: string,
  requestBody: ReadableStream<Uint8Array> | null,
  contentType: string | null
): Promise<Response> {
  const env: Record<string, string> = {
    GIT_PROJECT_ROOT: REPOS_DIR,
    GIT_HTTP_EXPORT_ALL: "1",
    PATH_INFO: pathInfo,
    QUERY_STRING: queryString,
    REQUEST_METHOD: method,
    SERVER_PROTOCOL: "HTTP/1.1",
    PATH: process.env.PATH || "",
  };

  if (contentType) {
    env.CONTENT_TYPE = contentType;
  }

  const proc = Bun.spawn([GIT_HTTP_BACKEND], {
    env,
    stdin: requestBody ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const timeout = setTimeout(() => {
    try { proc.kill(); } catch {}
  }, GIT_BACKEND_TIMEOUT_MS);

  if (requestBody && proc.stdin) {
    const writer = proc.stdin;
    const reader = requestBody.getReader();
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          writer.write(value);
        }
      } finally {
        writer.end();
      }
    })();
  }

  const stdout = proc.stdout;
  if (!stdout) {
    return new Response("git backend failed", { status: 500 });
  }

  const reader = stdout.getReader();
  let headerBuf = "";
  const bodyChunks: Uint8Array[] = [];
  let headersParsed = false;
  let responseHeaders = new Headers();
  let statusCode = 200;
  const decoder = new TextDecoder();

  while (!headersParsed) {
    const { done, value } = await reader.read();
    if (done) break;

    headerBuf += decoder.decode(value, { stream: true });
    const headerEnd = headerBuf.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const headerSection = headerBuf.slice(0, headerEnd);
    const remaining = headerBuf.slice(headerEnd + 4);

    for (const line of headerSection.split("\r\n")) {
      if (line.startsWith("Status:")) {
        const code = parseInt(line.slice(7).trim().split(" ")[0], 10);
        if (!isNaN(code)) statusCode = code;
      } else {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          responseHeaders.set(line.slice(0, colonIdx).trim(), line.slice(colonIdx + 1).trim());
        }
      }
    }

    if (remaining.length > 0) {
      bodyChunks.push(new TextEncoder().encode(remaining));
    }
    headersParsed = true;
  }

  const bodyStream = new ReadableStream({
    async start(controller) {
      for (const chunk of bodyChunks) {
        controller.enqueue(chunk);
      }
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        clearTimeout(timeout);
        controller.close();
      }
    },
  });

  return new Response(bodyStream, {
    status: statusCode,
    headers: responseHeaders,
  });
}
