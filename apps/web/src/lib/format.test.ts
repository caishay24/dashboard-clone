import { describe, expect, it, vi } from "vitest";
import { formatPct, formatRelativeTime, formatStars, formatTvl } from "./format";

describe("format helpers", () => {
  it("formats money, percentages, and stars compactly", () => {
    expect(formatTvl(1_230_000_000_000)).toBe("$1.23T");
    expect(formatPct(1.234).text).toBe("+1.23%");
    expect(formatPct(-1.234).className).toContain("red");
    expect(formatStars(195_000)).toBe("195k");
  });

  it("formats elapsed relative time in Chinese", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T00:00:00Z"));
    expect(formatRelativeTime("2026-05-12T00:00:00Z")).toBe("3天前");
    vi.useRealTimers();
  });
});
