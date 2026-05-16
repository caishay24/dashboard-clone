import { z } from "zod";
import githubAllowlistRaw from "../github-allowlist.json";
import { fetchWithRetry } from "../fetchWithRetry";

const allowlistItemSchema = z.object({
  repo: z.string(),
  category: z.string(),
  description: z.string(),
  tags: z.array(z.string())
});

const githubRepoSchema = z.object({
  language: z.string().nullable(),
  stargazers_count: z.number(),
  forks_count: z.number(),
  open_issues_count: z.number(),
  pushed_at: z.string(),
  html_url: z.string()
}).passthrough();

export interface GithubRepoItem {
  repo: string;
  category: string;
  description: string;
  tags: string[];
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string;
  html_url: string;
}

type AllowlistItem = z.infer<typeof allowlistItemSchema>;

const allowlist = z.array(allowlistItemSchema).parse(githubAllowlistRaw);
const categoryOrder = Array.from(new Set(allowlist.map((item) => item.category)));

export async function getGithubRepos(params: { category?: string }): Promise<GithubRepoItem[]> {
  const selected = params.category
    ? allowlist.filter((item) => item.category === params.category)
    : allowlist;

  // Partial-failure tolerance: individual repo fetch failure (rate limit, 404,
  // transient network) must not kill the whole route. Returns only successful
  // items; callers see fewer entries instead of UPSTREAM_DOWN.
  const settled = await mapConcurrentSettled(selected, 5, fetchRepo);
  const enriched: GithubRepoItem[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") enriched.push(r.value);
  }

  // If literally everything failed, signal upstream-down so the cache layer
  // does not poison stale state with an empty success.
  if (enriched.length === 0 && selected.length > 0) {
    throw new Error("GitHub: all repos failed (likely missing GITHUB_PAT or rate limit)");
  }

  return enriched.sort((a, b) => {
    const categoryDelta = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
    if (categoryDelta !== 0) return categoryDelta;
    return b.stargazers_count - a.stargazers_count;
  });
}

async function fetchRepo(item: AllowlistItem): Promise<GithubRepoItem> {
  const response = await fetchWithRetry(`https://api.github.com/repos/${item.repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(process.env.GITHUB_PAT ? { Authorization: `Bearer ${process.env.GITHUB_PAT}` } : {})
    }
  });
  if (!response.ok) throw new Error(`GitHub ${item.repo} HTTP ${response.status}`);
  const repo = githubRepoSchema.parse(await response.json());

  return {
    ...item,
    language: repo.language,
    stargazers_count: repo.stargazers_count,
    forks_count: repo.forks_count,
    open_issues_count: repo.open_issues_count,
    pushed_at: repo.pushed_at,
    html_url: repo.html_url
  };
}

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
}

async function mapConcurrentSettled<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { status: "fulfilled", value: await mapper(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }));
  return results;
}
