import { useEffect, useState } from "react";
import { SectionLayout } from "../components/SectionLayout";
import { useDashboardQuery } from "../hooks/useDashboardQuery";
import { formatNumber, formatPct } from "../lib/format";

const regions = [["us", "美股"], ["cn", "A股"], ["hk", "港股"]] as const;

interface StockItem {
  code: string;
  secid: string;
  name_cn: string;
  sector: string;
  price: number | null;
  change_pct: number | null;
  change_abs: number | null;
  high: number | null;
  low: number | null;
  prev_close: number | null;
  volume: number | null;
  amount: number | null;
  amplitude_pct: number | null;
  pe: number | null;
  pb: number | null;
  market_cap: number | null;
  volume_ratio: number | null;
}

function formatMoney(yuan: number | null | undefined): string {
  if (yuan == null) return "—";
  const abs = Math.abs(yuan);
  if (abs >= 1e12) return `${(yuan / 1e12).toFixed(2)} 万亿`;
  if (abs >= 1e8) return `${(yuan / 1e8).toFixed(2)} 亿`;
  if (abs >= 1e4) return `${(yuan / 1e4).toFixed(2)} 万`;
  return yuan.toFixed(0);
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export default function Stocks() {
  const [region, setRegion] = useState<(typeof regions)[number][0]>("us");
  const [sector, setSector] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounced(searchInput.trim(), 400);
  const isSearching = debouncedSearch.length >= 1;

  // Default curated list (region tabs + sector filter)
  const listPath = `/api/stocks?region=${region}${sector === "all" ? "" : `&sector=${encodeURIComponent(sector)}`}`;
  const listQuery = useDashboardQuery<StockItem[]>("stocks", listPath);

  // Search query (only enabled when user has typed something)
  const searchRegion = "all"; // search all markets — user filters via input
  const searchPath = isSearching
    ? `/api/stocks/search?q=${encodeURIComponent(debouncedSearch)}&region=${searchRegion}&limit=20`
    : "/api/_disabled";
  const searchQuery = useDashboardQuery<StockItem[]>("stocks-search", searchPath, {
    enabled: isSearching
  });

  const activeQuery = isSearching ? searchQuery : listQuery;
  const data = activeQuery.envelope?.data ?? [];
  const rows = [...data].sort((a, b) => (b.change_pct ?? -Infinity) - (a.change_pct ?? -Infinity));
  const sectors = isSearching
    ? []
    : ["all", ...Array.from(new Set((listQuery.envelope?.data ?? []).map((item) => item.sector).filter(Boolean)))];

  return (
    <div className="space-y-3">
      {/* Region tabs */}
      <div className="flex gap-2">
        {regions.map(([id, label]) => (
          <button
            key={id}
            type="button"
            disabled={isSearching}
            onClick={() => setRegion(id)}
            className={`rounded border px-3 py-2 text-sm ${
              isSearching
                ? "border-app-line/30 text-app-muted/50"
                : region === id
                  ? "border-app-fg bg-app-fg text-app-bg"
                  : "border-app-line text-app-fg"
            }`}
          >
            {label}
          </button>
        ))}
        {/* Search input */}
        <div className="relative ml-auto flex-1 max-w-md">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索：苹果 / AAPL / 600519 / 茅台 …"
            className="w-full rounded border border-app-line bg-app-panel px-3 py-2 text-sm text-app-fg placeholder:text-app-muted focus:border-app-fg focus:outline-none"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-fg"
              aria-label="清除搜索"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <SectionLayout
        title={isSearching ? `搜索结果：${debouncedSearch}` : "股票市场"}
        envelope={activeQuery.envelope}
        isLoading={activeQuery.isLoading}
        error={activeQuery.error}
        empty={rows.length === 0}
      >
        {!isSearching && (
          <div className="flex gap-2 overflow-x-auto">
            {sectors.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSector(item)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs ${sector === item ? "border-app-fg bg-app-fg text-app-bg" : "border-app-line text-app-muted"}`}
              >
                {item === "all" ? "全部" : item}
              </button>
            ))}
          </div>
        )}
        {isSearching && rows.length === 0 && (
          <div className="rounded-lg border border-app-line bg-app-panel p-6 text-center text-sm text-app-muted">
            未搜到 "{debouncedSearch}"。请尝试中文名称（如「苹果」「茅台」）、英文代码（如 AAPL）或股票代码（如 600519）。
          </div>
        )}
        {rows.length > 0 && (
          <div className="max-h-[620px] overflow-auto rounded-lg border border-app-line bg-app-panel">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-app-panel font-mono text-xs uppercase text-app-muted">
                <tr>
                  {["代码/名称", "板块", "现价", "涨跌%", "涨跌", "最高", "最低", "昨收", "成交量", "成交额", "振幅", "市盈率", "市净率", "总市值"].map((header) => (
                    <th key={header} className="border-b border-app-line px-3 py-2">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const pct = formatPct(item.change_pct);
                  const abs = formatPct(item.change_abs);
                  const open = () => {
                    if (item.secid) window.location.hash = `stocks/${item.secid}`;
                  };
                  return (
                    <tr
                      key={`${item.code}-${item.sector}`}
                      onClick={open}
                      className="cursor-pointer border-b border-app-line/70 hover:bg-white/5"
                      title="点击查看个股详情"
                    >
                      <td className="px-3 py-2">
                        <div className="font-mono text-app-fg underline decoration-app-line decoration-dotted underline-offset-2">{item.code}</div>
                        <div className="text-xs text-app-muted">{item.name_cn}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-app-muted">{item.sector}</td>
                      <td className="px-3 py-2 font-mono">{formatNumber(item.price)}</td>
                      <td className={`px-3 py-2 font-mono ${pct.className}`}>{pct.text}</td>
                      <td className={`px-3 py-2 font-mono ${abs.className}`}>{formatNumber(item.change_abs)}</td>
                      <td className="px-3 py-2 font-mono">{formatNumber(item.high)}</td>
                      <td className="px-3 py-2 font-mono">{formatNumber(item.low)}</td>
                      <td className="px-3 py-2 font-mono">{formatNumber(item.prev_close)}</td>
                      <td className="px-3 py-2 font-mono">{formatNumber(item.volume, 0)}</td>
                      <td className="px-3 py-2 font-mono">{formatMoney(item.amount)}</td>
                      <td className="px-3 py-2 font-mono">{formatPct(item.amplitude_pct).text}</td>
                      <td className="px-3 py-2 font-mono">{item.pe != null ? item.pe.toFixed(2) : "—"}</td>
                      <td className="px-3 py-2 font-mono">{item.pb != null ? item.pb.toFixed(2) : "—"}</td>
                      <td className="px-3 py-2 font-mono">{formatMoney(item.market_cap)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionLayout>
    </div>
  );
}
