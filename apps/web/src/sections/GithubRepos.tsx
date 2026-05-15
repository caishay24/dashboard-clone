import { useMemo, useState } from "react";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { SectionLayout } from "../components/SectionLayout";
import { useDashboardQuery } from "../hooks/useDashboardQuery";
import { formatRelativeTime, formatStars } from "../lib/format";

interface GithubRepoItem {
  repo: string;
  category: string;
  description: string;
  tags: string[];
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
  html_url: string;
}

export default function GithubRepos() {
  const [category, setCategory] = useState("all");
  const path = `/api/github-repos${category === "all" ? "" : `?category=${encodeURIComponent(category)}`}`;
  const query = useDashboardQuery<GithubRepoItem[]>("github-repos", path);
  const rows = query.envelope?.data ?? [];
  const categories = useMemo(() => ["all", ...Array.from(new Set(rows.map((item) => item.category)))], [rows]);
  const total = category === "all" ? rows.length : undefined;

  return (
    <SectionLayout title="GitHub 库" envelope={query.envelope} isLoading={query.isLoading} error={query.error} empty={rows.length === 0}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto">
          {categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${category === item ? "border-app-fg bg-app-fg text-app-bg" : "border-app-line text-app-muted"}`}>{item === "all" ? "全部" : item}</button>)}
        </div>
        <Badge>全部 {total ?? "92"}</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((item) => {
          const owner = item.repo.split("/")[0];
          return (
            <Card key={item.repo} title={<a href={item.html_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline"><img src={`https://github.com/${owner}.png?size=40`} alt="" className="h-8 w-8 rounded-full" /><span>{item.repo}</span></a>}>
              <p className="min-h-12 text-sm text-app-muted">{item.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge>★{formatStars(item.stargazers_count)}</Badge>
                {item.language ? <Badge>{item.language}</Badge> : null}
                <Badge>{formatRelativeTime(item.pushed_at)}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">{item.tags.map((tag) => <span key={tag} className="rounded bg-white/5 px-2 py-1 text-xs text-app-muted">{tag}</span>)}</div>
            </Card>
          );
        })}
      </div>
    </SectionLayout>
  );
}
