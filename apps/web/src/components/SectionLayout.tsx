import type { PropsWithChildren, ReactNode } from "react";
import type { DashboardEnvelope } from "../hooks/useDashboardQuery";
import { StaleBanner } from "./StaleBanner";
import { ColdState } from "./ColdState";

export function SectionLayout<T>({
  title,
  envelope,
  isLoading,
  error,
  empty,
  children
}: PropsWithChildren<{
  title: string;
  envelope?: DashboardEnvelope<T>;
  isLoading?: boolean;
  error?: unknown;
  empty?: boolean;
}>) {
  if (isLoading) return <ColdState message="Loading..." />;
  if (error) return <ColdState message="数据请求失败，请稍后重试" />;
  if (envelope?.meta.state === "cold") return <ColdState message={envelope.error?.message ?? "当前板块暂无可用数据"} />;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-black text-app-fg">{title}</h2>
        {envelope?.meta.fetchedAt ? (
          <span className="font-mono text-xs text-app-muted">{new Date(envelope.meta.fetchedAt).toLocaleString("zh-CN")}</span>
        ) : null}
      </div>
      {envelope?.meta.state === "stale" ? <StaleBanner state="stale" /> : null}
      {empty ? <ColdState message="暂无数据" /> : children as ReactNode}
    </section>
  );
}
