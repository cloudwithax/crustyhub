import { Elysia } from "elysia";
import { listRepos, getRepoCount, searchRepos } from "../db/repos";
import { homePage } from "../views/pages/home";
import { newRepoPage } from "../views/pages/new-repo";
import { createRepo } from "../services/repo-service";
import { validateSlug } from "../git/paths";
import { validateDescription, validateSearchQuery } from "../middleware/input-validator";
import { getClientIp } from "../middleware/rate-limiter";
import { scoreWriteRequest, isBanned, checkBannedPatterns } from "../middleware/spam-detector";

export const homeRoutes = new Elysia()
  .get("/", async ({ query }) => {
    const q = (query as any).q as string | undefined;
    const { clean: cleanQ, error: qError } = validateSearchQuery(q);
    if (qError) {
      return new Response(homePage([], 0), {
        status: 400,
        headers: { "content-type": "text/html" },
      });
    }
    let repos;
    let count;
    if (cleanQ) {
      repos = await searchRepos(cleanQ);
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
  .post("/new", async ({ body, request }) => {
    const ip = getClientIp(request);
    const banBlock = isBanned(ip);
    if (banBlock) return banBlock;

    const { slug, description } = body as { slug: string; description?: string };

    if (!slug || !validateSlug(slug)) {
      return new Response(newRepoPage("invalid repository name. use letters, numbers, dots, hyphens, underscores."), {
        status: 400,
        headers: { "content-type": "text/html" },
      });
    }

    const { clean: cleanDesc, error: descError } = validateDescription(description);
    if (descError) {
      return new Response(newRepoPage(descError), {
        status: 400,
        headers: { "content-type": "text/html" },
      });
    }

    const bannedBlock = checkBannedPatterns(slug, cleanDesc);
    if (bannedBlock) return bannedBlock;

    const spamBlock = scoreWriteRequest(ip, { description: cleanDesc });
    if (spamBlock) return spamBlock;

    try {
      await createRepo(slug, cleanDesc);
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
