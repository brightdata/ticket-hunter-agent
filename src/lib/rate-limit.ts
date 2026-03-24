import { Redis } from "@upstash/redis";

const RATE_LIMIT_WINDOW_SECONDS = 24 * 60 * 60;
const RATE_LIMIT_MAX_REQUESTS = 3;
const RATE_LIMIT_KEY_PREFIX = "ip";

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Missing Upstash Redis configuration. Set KV_REST_API_URL and KV_REST_API_TOKEN.",
    );
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

function normalizeIp(ip: string): string {
  const firstAddress = ip.split(",")[0]?.trim() ?? "";
  const withoutIpv6Prefix = firstAddress.replace(/^::ffff:/, "");

  return withoutIpv6Prefix || "unknown";
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return normalizeIp(forwardedFor);
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return normalizeIp(realIp);
  }

  return "unknown";
}

export interface RateLimitResult {
  allowed: boolean;
}

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const normalizedIp = normalizeIp(ip);
  const key = `${RATE_LIMIT_KEY_PREFIX}:${normalizedIp}`;
  const redis = getRedisClient();

  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
  }

  return { allowed: count <= RATE_LIMIT_MAX_REQUESTS };
}
