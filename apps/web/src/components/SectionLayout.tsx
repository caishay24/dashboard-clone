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

  const state = envelope?.meta.state;
  const degraded = envelope?.meta.degraded ?? [];
  const dotClass =
    state === "fresh" ? "bg-emerald-500" :
    state === "stale" ? "bg-amber-500" :
    "bg-zinc-500";
  const dotPulse = state === "fresh" ? "animate-pulse" : "";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${dotClass} ${dotPulse}`}
            title={`数据状态：${state ?? "loading"}`}
          />
          <h2 className="text-base font-black text-app-fg">{title}</h2>
          {degraded.length > 0 ? (
            <span
              className="rounded border border-amber-700/50 bg-amber-900/30 px-1.5 py-0.5 font-mono text-[10px] uppercase text-amber-300"
              title={`部分数据源不可用：${degraded.join(", ")}`}
            >
              partial · {degraded.join(",")}
            </span>
          ) : null}
        </div>
        {envelope?.meta.fetchedAt ? (
          <span className="font-mono text-xs text-app-muted">{new Date(envelope.meta.fetchedAt).toLocaleString("zh-CN")}</span>
        ) : null}
      </div>
      {state === "stale" ? <StaleBanner state="stale" /> : null}
      {empty ? <ColdState message="暂无数据" /> : children as ReactNode}
    </section>
  );
}
