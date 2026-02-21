import { Elysia } from "elysia";
import { PORT, HOST, BASE_URL } from "./config/env";
import { initDb } from "./db/index";
import { ensureDirectories } from "./services/repo-service";
import { homeRoutes } from "./routes/home";
import { repoRoutes } from "./routes/repo";
import { issueRoutes } from "./routes/issues";
import { handleGitHttp } from "./routes/git";
import { skillRoute } from "./routes/skill";
import { join } from "path";
import { readFileSync, existsSync } from "fs";
import { getClientIp, classifyRequest, checkRateLimit } from "./middleware/rate-limiter";
import { getOrCreateCsrfToken, validateCsrfToken, csrfErrorResponse } from "./middleware/csrf";

const STATIC_DIR = join(process.cwd(), "public");

await ensureDirectories();
await initDb();

const app = new Elysia()
  .get("/public/*", ({ params }) => {
    const filePath = join(STATIC_DIR, (params as any)["*"]);
    if (!existsSync(filePath))
      return new Response("not found", { status: 404 });

    const ext = filePath.split(".").pop() || "";
    const mimeTypes: Record<string, string> = {
      css: "text/css",
      js: "application/javascript",
      png: "image/png",
      jpg: "image/jpeg",
      svg: "image/svg+xml",
      ico: "image/x-icon",
    };

    return new Response(readFileSync(filePath), {
      headers: { "content-type": mimeTypes[ext] || "application/octet-stream" },
    });
  })
  .use(skillRoute)
  .use(homeRoutes)
  .use(issueRoutes)
  .use(repoRoutes);

Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(request) {
    const url = new URL(request.url);
    const ip = getClientIp(request);

    // Rate limit all requests
    const category = classifyRequest(request.method, url.pathname);
    const rateLimited = checkRateLimit(ip, category);
    if (rateLimited) return rateLimited;

    // Git routes handled separately (no CSRF)
    const gitResponse = await handleGitHttp(request);
    if (gitResponse) return gitResponse;

    // CSRF check for non-git POST requests
    if (request.method === "POST") {
      const cookies = request.headers.get("cookie") || "";
      const sessionMatch = cookies.match(/crustyhub_session=([^;]+)/);
      const sessionId = sessionMatch ? sessionMatch[1] : "";
      if (sessionId) {
        const cloned = request.clone();
        try {
          const formData = await cloned.formData();
          const csrfToken = formData.get("_csrf") as string | null;
          if (!validateCsrfToken(sessionId, csrfToken || undefined)) {
            return csrfErrorResponse();
          }
        } catch {
          // If body isn't form data, skip CSRF
        }
      }
    }

    return app.handle(request);
  },
});

console.log(`crustyhub running at http://${HOST}:${PORT}`);
console.log(`postgres running at ${process.env.DATABASE_URL}`);
