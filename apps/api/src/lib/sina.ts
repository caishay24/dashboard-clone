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
//   - `hk<code>` (HK index): symbol, name, open, high, ..., current, changeAbs, changePct, ...
//
// Verified symbols (2026-05-15 spike from CN IP):
//   sh000001  上证指数 — works as short `s_sh000001` (returns 6 fields)
//   hkHSI     恒生指数 — long format (`s_hkHSI` returns empty)
//   gb_dji    道琼斯  — long format
//   gb_ixic   纳斯达克 — long format
//   gb_inx    标普500指数 — long format
import { fetchWithRetry } from "../fetchWithRetry";

const SINA_BASE = "https://hq.sinajs.cn/list=";
const SINA_REFERER = "https://finance.sina.com.cn/";

export type SinaSymbolKind = "a-short" | "long" | "a-stock";

export interface SinaIndexQuote {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number | null;
  changeAbs: number | null;
  // US-only enrichment (pos 12 = total market cap, pos 14 = PE TTM in `gb_<sym>` format)
  marketCap?: number | null;
  pe?: number | null;
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
    // s_<code> short A股 index format: name, price, changeAbs, changePct, volume, amount
    if (fields.length < 4) return null;
    const price = num(fields[1]);
    const changeAbs = num(fields[2]);
    const changePct = num(fields[3]);
    return { symbol, name: fields[0] ?? "", price, changeAbs, changePct };
  }
  if (kind === "a-stock") {
    // sh<code>/sz<code> A股 individual stock format:
    //   name, open, prevClose, currentPrice, high, low, bid1, ask1, volume, amount, ...orderbook..., date, time
    // Compute changeAbs and changePct from prevClose because Sina does not return them inline here.
    if (fields.length < 4) return null;
    const prevClose = num(fields[2]);
    const price = num(fields[3]);
    if (price === null || prevClose === null || prevClose === 0) return null;
    const changeAbs = price - prevClose;
    const changePct = (changeAbs / prevClose) * 100;
    return { symbol, name: fields[0] ?? "", price, changeAbs, changePct };
  }
  if (symbol.startsWith("hk")) {
    // HK long format (indices + stocks): symbol, name, open, prevClose, high, low, current, changeAbs, changePct, ...
    if (fields.length < 9) return null;
    const price = num(fields[6]);
    const changeAbs = num(fields[7]);
    const changePct = num(fields[8]);
    return { symbol, name: fields[1] ?? "", price, changePct, changeAbs };
  }
  // US long format (indices + stocks gb_<sym>): name, price, changePct, date, changeAbs, prevClose, open, ...
  // For individual US stocks (gb_<lower-ticker>), pos 12 = total market cap (USD) and pos 14 = PE TTM.
  // Index symbols (gb_inx, gb_dji, gb_ixic, gb_spy) reuse the same positional layout but with
  // mcap/PE either as 0 or NaN — guarded by num()/range checks below.
  if (fields.length < 5) return null;
  const price = num(fields[1]);
  const changePct = num(fields[2]);
  const changeAbs = num(fields[4]);
  const marketCapRaw = fields.length > 12 ? num(fields[12]) : null;
  const peRaw = fields.length > 14 ? num(fields[14]) : null;
  // Sane filters: drop sentinel zeros (0 mcap or 0 PE means "not applicable")
  // and outliers (PE > 10000 likely garbage / negative PE = loss-making, also null).
  const marketCap = marketCapRaw && marketCapRaw > 0 ? marketCapRaw : null;
  const pe = peRaw && peRaw > 0 && peRaw < 10000 ? peRaw : null;
  return { symbol, name: fields[0] ?? "", price, changePct, changeAbs, marketCap, pe };
}

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
