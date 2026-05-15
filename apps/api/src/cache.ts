import { envelope, type AppEnvelope } from "./types";

type CacheState = "fresh" | "stale" | "cold";

interface CacheRecord<T> {
  data: T;
  fetchedAt: string;
}

const redisUrl = process.env.REDIS_URL;
let upstash: UpstashCacheClient | null | undefined;
let nodeRedis: NodeRedisCacheClient | null = null;
let nodeRedisUnavailable = false;
const memory = new Map<string, CacheRecord<unknown>>();
const inflight = new Map<string, Promise<AppEnvelope<unknown>>>();

interface UpstashCacheClient {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
}

interface NodeRedisCacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
}

export async function getOrFetch<T>(
  key: string,
  ttlSec: number,
  hardMaxSec: number,
  fetcher: () => Promise<T>
): Promise<AppEnvelope<T>> {
  const cached = await readCache<T>(key);
  const now = Date.now();
  const ageMs = cached ? now - Date.parse(cached.fetchedAt) : Number.POSITIVE_INFINITY;

  if (cached && ageMs <= ttlSec * 1000) {
    return wrap(cached, "fresh", ttlSec);
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<AppEnvelope<T>>;

  const request = fetchAndCache(key, ttlSec, hardMaxSec, fetcher, cached, ageMs, now);
  inflight.set(key, request as Promise<AppEnvelope<unknown>>);
  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
}

async function fetchAndCache<T>(
  key: string,
  ttlSec: number,
  hardMaxSec: number,
  fetcher: () => Promise<T>,
  cached: CacheRecord<T> | null | undefined,
  ageMs: number,
  now: number
): Promise<AppEnvelope<T>> {
  try {
    const data = await fetcher();
    const record = { data, fetchedAt: new Date(now).toISOString() };
    await writeCache(key, record);
    return wrap(record, "fresh", ttlSec);
  } catch {
    if (cached && ageMs <= hardMaxSec * 1000) {
      return wrap(cached, "stale", ttlSec);
    }
    return envelope<T>(null, { state: "cold", source: key }, {
      code: "UPSTREAM_DOWN",
      message: "upstream unavailable"
    });
  }
}

function wrap<T>(record: CacheRecord<T>, state: CacheState, ttlSec: number) {
  const fetchedAt = new Date(record.fetchedAt);
  const expiresAt = new Date(fetchedAt.getTime() + ttlSec * 1000);
  return envelope(record.data, { state, fetchedAt, expiresAt });
}

async function readCache<T>(key: string) {
  const upstashClient = await getUpstash();
  if (upstashClient) return upstashClient.get<CacheRecord<T>>(key);
  const client = await getNodeRedis();
  if (client) {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) as CacheRecord<T> : null;
  }
  return memory.get(key) as CacheRecord<T> | undefined;
}

async function writeCache<T>(key: string, record: CacheRecord<T>) {
  const upstashClient = await getUpstash();
  if (upstashClient) {
    await upstashClient.set(key, record);
    return;
  }
  const client = await getNodeRedis();
  if (client) {
    await client.set(key, JSON.stringify(record));
    return;
  }
  memory.set(key, record);
}

async function getNodeRedis() {
  if (!redisUrl || redisUrl.startsWith("http") || nodeRedisUnavailable) return null;
  if (!nodeRedis) {
    const { createClient } = await import("redis");
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
      nodeRedis = client as NodeRedisCacheClient;
    } catch {
      nodeRedisUnavailable = true;
      await client.disconnect().catch(() => undefined);
      return null;
    }
  }
  return nodeRedis;
}

async function getUpstash() {
  if (!redisUrl?.startsWith("http")) return null;
  if (upstash === undefined) {
    const { Redis } = await import("@upstash/redis");
    upstash = Redis.fromEnv();
  }
  return upstash;
}
