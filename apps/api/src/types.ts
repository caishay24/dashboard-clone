import type { CacheSource, Envelope, ErrorCode, ResponseState } from "@dashboard/shared";

export type AppEnvelope<T> = Envelope<T>;

export function envelope<T>(
  data: T | null,
  meta: {
    state: ResponseState;
    fetchedAt?: Date | null;
    expiresAt?: Date | null;
    source?: string | null;
    cache?: CacheSource;
    degraded?: string[];
  },
  error: { code: ErrorCode; message: string } | null = null
): AppEnvelope<T> {
  return {
    data,
    meta: {
      state: meta.state,
      fetchedAt: meta.fetchedAt ? meta.fetchedAt.toISOString() : null,
      expiresAt: meta.expiresAt ? meta.expiresAt.toISOString() : null,
      source: meta.source ?? null,
      ...(meta.cache ? { cache: meta.cache } : {}),
      ...(meta.degraded ? { degraded: meta.degraded } : {})
    },
    error
  };
}

export function coldEnvelope<T>(source: string): AppEnvelope<T> {
  return envelope<T>(null, { state: "cold", source }, {
    code: "COLD",
    message: "adapter not implemented"
  });
}
