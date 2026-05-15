import { describe, expect, it } from "vitest";
import { bollinger, macd, rsi, sma } from "../indicators";

describe("indicators", () => {
  it("computes simple moving averages after warmup", () => {
    expect(sma([1, 2, 3, 4, 5, 6], 5)).toEqual([3, 4]);
  });

  it("computes Bollinger bands from a known window", () => {
    const result = bollinger([1, 2, 3, 4, 5], 5, 2);

    expect(result.mid[0]).toBe(3);
    expect(result.upper[0]).toBeCloseTo(5.82842712, 6);
    expect(result.lower[0]).toBeCloseTo(0.17157288, 6);
  });

  it("computes RSI and MACD arrays", () => {
    const values = Array.from({ length: 40 }, (_, index) => index + 1);

    expect(rsi(values, 14).at(-1)).toBe(100);
    expect(macd(values, 12, 26, 9).macd.length).toBe(15);
    expect(macd(values, 12, 26, 9).signal.length).toBe(7);
  });
});
