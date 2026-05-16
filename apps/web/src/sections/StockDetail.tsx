import { SectionLayout } from "../components/SectionLayout";
import { useDashboardQuery } from "../hooks/useDashboardQuery";
import { formatNumber, formatPct } from "../lib/format";

interface StockQuote {
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

interface FinanceReport {
  REPORT_DATE: string;
  REPORT_TYPE: string;
  REPORT_DATE_NAME?: string | null;
  EPSJB?: number | null;
  BPS?: number | null;
  MGJYXJJE?: number | null;
  TOTALOPERATEREVE?: number | null;
  MLR?: number | null;
  PARENTNETPROFIT?: number | null;
  KCFJCXSYJLR?: number | null;
  TOTALOPERATEREVETZ?: number | null;
  PARENTNETPROFITTZ?: number | null;
  KCFJCXSYJLRTZ?: number | null;
}

interface CashflowRow {
  REPORT_DATE: string;
  REPORT_TYPE: string;
  NETCASH_OPERATE?: number | null;
  NETCASH_INVEST?: number | null;
  NETCASH_FINANCE?: number | null;
}

interface StockDetailData {
  secid: string;
  quote: StockQuote | null;
  reports: FinanceReport[] | null;
  cashflow: CashflowRow[] | null;
  notes: string[];
}

function formatMoney(yuan: number | null | undefined): string {
  if (yuan == null) return "—";
  const abs = Math.abs(yuan);
  if (abs >= 1e12) return `${(yuan / 1e12).toFixed(2)} 万亿`;
  if (abs >= 1e8) return `${(yuan / 1e8).toFixed(2)} 亿`;
  if (abs >= 1e4) return `${(yuan / 1e4).toFixed(2)} 万`;
  return `${yuan.toFixed(0)}`;
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return s.slice(0, 10);
}

export default function StockDetail({ secid }: { secid: string }) {
  const query = useDashboardQuery<StockDetailData>("stocks-detail", `/api/stocks/detail?secid=${encodeURIComponent(secid)}`);
  const d = query.envelope?.data ?? null;
  const quote = d?.quote ?? null;
  const reports = d?.reports ?? null;
  const cashflow = d?.cashflow ?? null;
  const notes = d?.notes ?? [];

  const back = () => {
    window.location.hash = "stocks";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={back}
          className="rounded border border-app-line px-3 py-1.5 text-sm text-app-muted hover:border-app-fg hover:text-app-fg"
        >
          ← 返回股票市场
        </button>
        <span className="font-mono text-xs text-app-muted">secid {secid}</span>
      </div>

      <SectionLayout
        title={quote ? `${quote.name_cn} · ${quote.code}` : "个股详情"}
        envelope={query.envelope}
        isLoading={query.isLoading}
        error={query.error}
        empty={!quote}
      >
        {/* 1. 行情卡片 */}
        {quote && (
          <div className="rounded-lg border border-app-line bg-app-panel p-4">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-3xl font-black">{formatNumber(quote.price, 2)}</span>
              <span className={`font-mono text-base ${formatPct(quote.change_pct).className}`}>
                {formatPct(quote.change_pct).text}
              </span>
              <span className={`font-mono text-sm ${formatPct(quote.change_abs).className}`}>
                {quote.change_abs != null ? (quote.change_abs > 0 ? `+${formatNumber(quote.change_abs)}` : formatNumber(quote.change_abs)) : "—"}
              </span>
              <span className="ml-auto rounded bg-app-bg px-2 py-1 text-xs text-app-muted">{quote.sector}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
              <Metric label="最高" value={formatNumber(quote.high)} />
              <Metric label="最低" value={formatNumber(quote.low)} />
              <Metric label="昨收" value={formatNumber(quote.prev_close)} />
              <Metric label="振幅" value={formatPct(quote.amplitude_pct).text} />
              <Metric label="成交量" value={formatNumber(quote.volume, 0)} />
              <Metric label="成交额" value={formatMoney(quote.amount)} />
              <Metric label="量比" value={quote.volume_ratio != null ? quote.volume_ratio.toFixed(2) : "—"} />
              <Metric label="市值" value={formatMoney(quote.market_cap)} />
              <Metric label="市盈率" value={quote.pe != null ? quote.pe.toFixed(2) : "—"} />
              <Metric label="市净率" value={quote.pb != null ? quote.pb.toFixed(2) : "—"} />
            </div>
          </div>
        )}

        {/* 2. 财务报表 (A股) */}
        {reports && reports.length > 0 && (
          <div className="rounded-lg border border-app-line bg-app-panel">
            <div className="border-b border-app-line px-4 py-2 text-sm font-bold">财务摘要（近 {reports.length} 期）</div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-app-bg font-mono uppercase text-app-muted">
                  <tr>
                    <th className="border-b border-app-line px-3 py-2">报告期</th>
                    {reports.map((r) => (
                      <th key={r.REPORT_DATE} className="border-b border-app-line px-3 py-2 text-right">
                        {r.REPORT_DATE_NAME ?? `${formatDate(r.REPORT_DATE)} ${r.REPORT_TYPE}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <FinRow label="基本每股收益（元）" rows={reports} get={(r) => r.EPSJB} />
                  <FinRow label="每股净资产（元）" rows={reports} get={(r) => r.BPS} />
                  <FinRow label="每股经营现金流" rows={reports} get={(r) => r.MGJYXJJE} />
                  <FinRow label="营业总收入" rows={reports} get={(r) => r.TOTALOPERATEREVE} money />
                  <FinRow label="毛利润" rows={reports} get={(r) => r.MLR} money />
                  <FinRow label="归母净利润" rows={reports} get={(r) => r.PARENTNETPROFIT} money />
                  <FinRow label="扣非净利润" rows={reports} get={(r) => r.KCFJCXSYJLR} money />
                  <FinRow label="营收同比" rows={reports} get={(r) => r.TOTALOPERATEREVETZ} pct />
                  <FinRow label="净利润同比" rows={reports} get={(r) => r.PARENTNETPROFITTZ} pct />
                  <FinRow label="扣非净利同比" rows={reports} get={(r) => r.KCFJCXSYJLRTZ} pct />
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. 现金流 (A股) */}
        {cashflow && cashflow.length > 0 && (
          <div className="rounded-lg border border-app-line bg-app-panel">
            <div className="border-b border-app-line px-4 py-2 text-sm font-bold">现金流量（近 {cashflow.length} 期）</div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-app-bg font-mono uppercase text-app-muted">
                  <tr>
                    <th className="border-b border-app-line px-3 py-2">报告期</th>
                    {cashflow.map((r) => (
                      <th key={r.REPORT_DATE} className="border-b border-app-line px-3 py-2 text-right">
                        {formatDate(r.REPORT_DATE)} {r.REPORT_TYPE}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <FinRow label="经营活动现金流" rows={cashflow} get={(r) => r.NETCASH_OPERATE} money />
                  <FinRow label="投资活动现金流" rows={cashflow} get={(r) => r.NETCASH_INVEST} money />
                  <FinRow label="筹资活动现金流" rows={cashflow} get={(r) => r.NETCASH_FINANCE} money />
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. 财务不可用的市场提示 */}
        {!reports && !cashflow && quote && (
          <div className="rounded-lg border border-app-line bg-app-panel p-4 text-sm text-app-muted">
            <p>财报与现金流数据当前仅支持 A 股（沪深）。{quote.sector} 个股财务待后续接入。</p>
            {notes.length > 0 && <p className="mt-2 font-mono text-xs">{notes.join(" / ")}</p>}
          </div>
        )}
      </SectionLayout>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-app-muted">{label}</span>
      <span className="font-mono text-sm text-app-fg">{value ?? "—"}</span>
    </div>
  );
}

function FinRow<T>({
  label,
  rows,
  get,
  money,
  pct
}: {
  label: string;
  rows: T[];
  get: (row: T) => number | null | undefined;
  money?: boolean;
  pct?: boolean;
}) {
  return (
    <tr className="border-b border-app-line/40 hover:bg-white/5">
      <td className="px-3 py-2 text-app-muted">{label}</td>
      {rows.map((r, i) => {
        const v = get(r);
        let display = "—";
        let color = "";
        if (v == null) display = "—";
        else if (money) display = formatMoney(v);
        else if (pct) {
          display = `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
          color = v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "";
        } else display = v.toFixed(2);
        return (
          <td key={i} className={`px-3 py-2 text-right font-mono ${color}`}>{display}</td>
        );
      })}
    </tr>
  );
}
