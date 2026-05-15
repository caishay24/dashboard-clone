import { z } from "zod";

export const responseStateSchema = z.enum(["fresh", "stale", "cold"]);
export const errorCodeSchema = z.enum(["COLD", "UPSTREAM_DOWN", "RATE_LIMITED", "BAD_QUERY"]);

export const responseMetaSchema = z.object({
  state: responseStateSchema,
  fetchedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  source: z.string().nullable().optional(),
  degraded: z.array(z.string()).optional()
});

export const responseErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string()
});

export const envelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    data: data.nullable(),
    meta: responseMetaSchema,
    error: responseErrorSchema.nullable()
  });

export const regionSchema = z.enum(["us", "cn", "hk"]);
export const exchangeSchema = z.enum(["okx", "bitget", "gate", "bybit"]);
export const onchainStockSchema = z.object({
  symbol: z.string(),
  issuer: z.string(),
  chain: z.string(),
  contract: z.string(),
  category: z.string(),
  price: z.number().nullable(),
  change24h: z.number().nullable(),
  confidence: z.number().nullable(),
  ts: z.number().nullable()
});

export const tokenAllowlistItemSchema = z.object({
  symbol: z.string().min(1),
  chain: z.string().min(1),
  contract: z.string().min(1),
  issuer: z.string().min(1),
  category: z.string().min(1)
});

export type ResponseState = z.infer<typeof responseStateSchema>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type ResponseMeta = z.infer<typeof responseMetaSchema>;
export type ResponseError = z.infer<typeof responseErrorSchema>;
export type Envelope<T> = {
  data: T | null;
  meta: ResponseMeta;
  error: ResponseError | null;
};
export type Region = z.infer<typeof regionSchema>;
export type Exchange = z.infer<typeof exchangeSchema>;
export type OnchainStock = z.infer<typeof onchainStockSchema>;
export type TokenAllowlistItem = z.infer<typeof tokenAllowlistItemSchema>;
