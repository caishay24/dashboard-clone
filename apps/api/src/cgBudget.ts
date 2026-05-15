import { Redis } from "@upstash/redis";
import { createClient } from "redis";

const THRESHOLD = 9500;
const redisUrl = process.env.REDIS_URL;
const upstash = process.env.UPSTASH_REDIS_REST_URL ? Redis.fromEnv() : null;
let nodeRedis: ReturnType<typeof createClient> | null = null;
let nodeRedisUnavailable = false;
const memory = new Map<string, number>();

export async function countCoinGeckoAttempt(count = 1) {
  const key = monthKey();
  if (upstash) {
    const value = await upstash.incrby(key, count);
    await upstash.expire(key, secondsUntilNextUtcMonth());
    return value;
  }
  const client = await getNodeRedis();
  if (client) {
    const value = await client.incrBy(key, count);
    await client.expire(key, secondsUntilNextUtcMonth());
    return value;
  }
  const next = (memory.get(key) ?? 0) + count;
  memory.set(key, next);
  return next;
}

export async function isCoinGeckoStaleOnly() {
  return (await currentCoinGeckoUsage()) >= THRESHOLD;
}

export async function currentCoinGeckoUsage() {
  const key = monthKey();
  if (upstash) return Number((await upstash.get<number>(key)) ?? 0);
  const client = await getNodeRedis();
  if (client) return Number((await client.get(key)) ?? 0);
  return memory.get(key) ?? 0;
}

function monthKey() {
  const now = new Date();
  return `cg-budget:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function secondsUntilNextUtcMonth() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

async function getNodeRedis() {
  if (!redisUrl || redisUrl.startsWith("http") || nodeRedisUnavailable) return null;
  if (!nodeRedis) {
    const client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: false
      }
    });
    client.on("error", () => undefined);
    try {
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("redis connect timeout")), 500);
        })
      ]);
      nodeRedis = client;
    } catch {
      nodeRedisUnavailable = true;
      await client.disconnect().catch(() => undefined);
      return null;
    }
  }
  return nodeRedis;
}
