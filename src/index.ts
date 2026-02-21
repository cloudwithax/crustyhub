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
    const gitResponse = await handleGitHttp(request);
    if (gitResponse) return gitResponse;
    return app.handle(request);
  },
});

console.log(`crustyhub running at http://${HOST}:${PORT}`);
console.log(`postgres running at ${process.env.DATABASE_URL}`);
