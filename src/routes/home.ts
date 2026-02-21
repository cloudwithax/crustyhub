import { Elysia } from "elysia";
import { listRepos, getRepoCount, searchRepos } from "../db/repos";
import { homePage } from "../views/pages/home";
import { newRepoPage } from "../views/pages/new-repo";
import { createRepo } from "../services/repo-service";
import { validateSlug } from "../git/paths";

export const homeRoutes = new Elysia()
  .get("/", async ({ query }) => {
    const q = (query as any).q as string | undefined;
    let repos;
    let count;
    if (q) {
      repos = await searchRepos(q);
      count = repos.length;
    } else {
      repos = await listRepos();
      count = await getRepoCount();
    }
    return new Response(homePage(repos, count), {
      headers: { "content-type": "text/html" },
    });
  })
  .get("/new", () => {
    return new Response(newRepoPage(), {
      headers: { "content-type": "text/html" },
    });
  })
  .post("/new", async ({ body }) => {
    const { slug, description } = body as { slug: string; description?: string };

    if (!slug || !validateSlug(slug)) {
      return new Response(newRepoPage("invalid repository name. use letters, numbers, dots, hyphens, underscores."), {
        status: 400,
        headers: { "content-type": "text/html" },
      });
    }

    try {
      await createRepo(slug, description || "");
      return new Response(null, {
        status: 302,
        headers: { location: `/${slug}` },
      });
    } catch (e: any) {
      return new Response(newRepoPage(e.message), {
        status: 400,
        headers: { "content-type": "text/html" },
      });
    }
  });
