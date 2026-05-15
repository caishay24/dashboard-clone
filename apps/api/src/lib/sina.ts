// Sina Finance free quote API fallback for stock indices when 东方财富 push2 is blocked
// (typically when origin IP is outside CN — Vercel functions in hnd1/iad1 etc).
//
// Endpoint: https://hq.sinajs.cn/list=<symbol>[,<symbol>...]
// Headers: must include `Referer: https://finance.sina.com.cn/` or the API returns 403.
// Response: GBK-encoded text like:
//   var hq_str_<symbol>="<name>,<f1>,<f2>,...";
//
// Two response shapes depending on symbol prefix:
//   - `s_<code>` (short, A股 only):   name, price, changeAbs, changePct, volume, amount
//   - `<code>`   (long, indices/US/HK): name, price, changePct, date, changeAbs, prevClose, open, high, low, ...
//
// Verified symbols (2026-05-15 spike from CN IP):
//   sh000001  上证指数 — works as short `s_sh000001` (returns 6 fields)
//   hkHSI     恒生指数 — long format (`s_hkHSI` returns empty)
//   gb_dji    道琼斯  — long format
//   gb_ixic   纳斯达克 — long format
//   gb_spy    SPY ETF — long format (used as proxy for S&P 500: SPY × 10 ≈ S&P)
import { fetchWithRetry } from "../fetchWithRetry";

const SINA_BASE = "https://hq.sinajs.cn/list=";
const SINA_REFERER = "https://finance.sina.com.cn/";

export type SinaSymbolKind = "a-short" | "long";

export interface SinaIndexQuote {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number | null;
  changeAbs: number | null;
}

const decoder = new TextDecoder("gbk");

/**
 * Fetch one Sina symbol. Returns null on parse/network failure (adapter must handle null).
 */
export async function fetchSinaIndex(symbol: string, kind: SinaSymbolKind): Promise<SinaIndexQuote | null> {
  try {
    const response = await fetchWithRetry(`${SINA_BASE}${symbol}`, {
      headers: {
        Referer: SINA_REFERER,
        "User-Agent": "Mozilla/5.0"
      }
    });
    if (!response.ok) return null;
    // Sina returns GBK encoding — decode manually.
    const buf = await response.arrayBuffer();
    const text = decoder.decode(buf);
    return parseSinaLine(symbol, kind, text);
  } catch {
    return null;
  }
}

/**
 * Batch fetch — sina supports comma-separated symbols in a single request.
 * Returns map of symbol → quote (null entries dropped).
 */
export async function fetchSinaIndicesBatch(
  entries: Array<{ symbol: string; kind: SinaSymbolKind }>
): Promise<Record<string, SinaIndexQuote>> {
  const out: Record<string, SinaIndexQuote> = {};
  if (entries.length === 0) return out;
  try {
    const list = entries.map((e) => e.symbol).join(",");
    const response = await fetchWithRetry(`${SINA_BASE}${list}`, {
      headers: { Referer: SINA_REFERER, "User-Agent": "Mozilla/5.0" }
    });
    if (!response.ok) return out;
    const text = decoder.decode(await response.arrayBuffer());
    for (const { symbol, kind } of entries) {
      const parsed = parseSinaLine(symbol, kind, text);
      if (parsed) out[symbol] = parsed;
    }
  } catch {
    /* swallow */
  }
  return out;
}

function parseSinaLine(symbol: string, kind: SinaSymbolKind, text: string): SinaIndexQuote | null {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`var hq_str_${escaped}="([^"]*)";`);
  const m = re.exec(text);
  if (!m) return null;
  const inner = m[1];
  if (!inner) return null;
  const fields = inner.split(",");
  if (kind === "a-short") {
    // name, price, changeAbs, changePct, volume, amount
    if (fields.length < 4) return null;
    const price = num(fields[1]);
    const changeAbs = num(fields[2]);
    const changePct = num(fields[3]);
    return { symbol, name: fields[0] ?? "", price, changeAbs, changePct };
  }
  // long format: name, price, changePct, date, changeAbs, prevClose, open, ...
  if (fields.length < 5) return null;
  const price = num(fields[1]);
  const changePct = num(fields[2]);
  const changeAbs = num(fields[4]);
  return { symbol, name: fields[0] ?? "", price, changePct, changeAbs };
}

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
