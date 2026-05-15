export interface BollingerBands {
  upper: number[];
  mid: number[];
  lower: number[];
}

export interface MacdResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function sma(values: number[], period: number): number[] {
  if (period <= 0) throw new Error("period must be positive");
  const result: number[] = [];
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index] ?? 0;
    if (index >= period) sum -= values[index - period] ?? 0;
    if (index >= period - 1) result.push(sum / period);
  }
  return result;
}

export function bollinger(values: number[], period = 20, multiplier = 2): BollingerBands {
  const upper: number[] = [];
  const mid: number[] = [];
  const lower: number[] = [];

  for (let index = period - 1; index < values.length; index += 1) {
    const window = values.slice(index - period + 1, index + 1);
    const mean = window.reduce((sum, value) => sum + value, 0) / period;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    const deviation = Math.sqrt(variance);
    mid.push(mean);
    upper.push(mean + multiplier * deviation);
    lower.push(mean - multiplier * deviation);
  }

  return { upper, mid, lower };
}

export function rsi(values: number[], period = 14): number[] {
  if (values.length <= period) return [];
  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  const result = [relativeStrengthIndex(averageGain, averageLoss)];

  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
    result.push(relativeStrengthIndex(averageGain, averageLoss));
  }

  return result;
}

export function macd(values: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): MacdResult {
  const fast = ema(values, fastPeriod);
  const slow = ema(values, slowPeriod);
  const offset = slowPeriod - fastPeriod;
  const line = slow.map((slowValue, index) => (fast[index + offset] ?? 0) - slowValue);
  const signal = ema(line, signalPeriod);
  const signalOffset = line.length - signal.length;
  const histogram = signal.map((signalValue, index) => (line[index + signalOffset] ?? 0) - signalValue);

  return {
    macd: line,
    signal,
    histogram
  };
}

function ema(values: number[], period: number): number[] {
  if (period <= 0) throw new Error("period must be positive");
  if (values.length < period) return [];
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  let previous = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result.push(previous);

  for (let index = period; index < values.length; index += 1) {
    previous = (values[index] - previous) * multiplier + previous;
    result.push(previous);
  }

  return result;
}

function relativeStrengthIndex(averageGain: number, averageLoss: number) {
  if (averageLoss === 0) return 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}
