export function StaleBanner({ state }: { state: "stale" | "cold" }) {
  return (
    <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
      {state === "stale" ? "数据已过期，正在等待上游恢复。" : "当前板块尚未接入数据。"}
    </div>
  );
}
