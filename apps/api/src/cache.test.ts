import { describe, expect, it, vi } from "vitest";
import { getOrFetch } from "./cache";

describe("getOrFetch", () => {
  it("deduplicates concurrent cold misses by cache key", async () => {
    const key = `cache-dedupe:${crypto.randomUUID()}`;
    const fetcher = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { value: 42 };
    });

    const [first, second] = await Promise.all([
      getOrFetch(key, 30, 300, fetcher),
      getOrFetch(key, 30, 300, fetcher)
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first.data).toEqual({ value: 42 });
    expect(second.data).toEqual({ value: 42 });
    expect(first.meta.fetchedAt).toBe(second.meta.fetchedAt);
    expect(first.meta.cache).toBe("miss");
    expect(second.meta.cache).toBe("miss");
  });

  it("reports memory cache hits explicitly", async () => {
    const key = `cache-source:${crypto.randomUUID()}`;
    const fetcher = vi.fn(async () => ({ value: 7 }));

    const first = await getOrFetch(key, 30, 300, fetcher);
    const second = await getOrFetch(key, 30, 300, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first.meta.cache).toBe("miss");
    expect(second.meta.cache).toBe("memory");
    expect(second.data).toEqual({ value: 7 });
  });
});
