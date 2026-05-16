import { useQuery } from "@tanstack/react-query";

export interface DashboardEnvelope<T> {
  data: T | null;
  meta: {
    state: "fresh" | "stale" | "cold";
    fetchedAt: string | null;
    expiresAt: string | null;
    source?: string | null;
    cache?: "miss" | "upstash" | "redis" | "memory";
    degraded?: string[];
  };
  error: { code: string; message: string } | null;
}

export function useDashboardQuery<T>(key: string, path: string, options?: { refetchInterval?: number; enabled?: boolean }) {
  const query = useQuery({
    queryKey: [key, path],
    queryFn: async (): Promise<DashboardEnvelope<T>> => {
      const response = await fetch(path);
      if (!response.ok && response.status !== 400 && response.status !== 429) {
        throw new Error(`Request failed: ${response.status}`);
      }
      return response.json() as Promise<DashboardEnvelope<T>>;
    },
    refetchInterval: options?.refetchInterval,
    enabled: options?.enabled ?? true
  });

  return {
    ...query,
    envelope: query.data,
    showStaleBanner: query.data?.meta.state === "stale" || query.data?.meta.state === "cold"
  };
}
