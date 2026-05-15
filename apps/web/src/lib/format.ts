export function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

export function formatTvl(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "-";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function formatPercent(value: number | null | undefined, signed = false) {
  if (value == null || Number.isNaN(value)) return "-";
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatPct(value: number | null | undefined) {
  return {
    text: formatPercent(value, true),
    className: value == null || Number.isNaN(value) ? "text-app-muted" : value >= 0 ? "text-emerald-400" : "text-red-400"
  };
}

export function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return "-";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function formatRelativeTime(input: string | Date | null | undefined) {
  if (!input) return "-";
  const time = typeof input === "string" ? Date.parse(input) : input.getTime();
  const diffSec = Math.max(0, Math.round((Date.now() - time) / 1000));
  const abs = Math.abs(diffSec);
  if (abs < 60) return "刚刚";
  if (abs < 3600) return `${Math.floor(abs / 60)}分钟前`;
  if (abs < 86400) return `${Math.floor(abs / 3600)}小时前`;
  return `${Math.floor(abs / 86400)}天前`;
}

export function formatStars(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "-";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}
