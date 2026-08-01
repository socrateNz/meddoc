import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// Repli en mémoire pour le développement local sans compte Upstash configuré.
// Ne partage pas l'état entre plusieurs instances/process : à ne jamais
// utiliser en production serverless (voir .env.example pour les variables
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN requises en prod).
const memoryCache = new Map<string, { count: number; resetTime: number }>();

function memoryRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const cached = memoryCache.get(key);

  if (!cached || now > cached.resetTime) {
    memoryCache.set(key, { count: 1, resetTime: now + windowMs });
    return { success: true, count: 1 };
  }

  cached.count++;
  if (cached.count > limit) {
    return { success: false, count: cached.count };
  }
  return { success: true, count: cached.count };
}

// Un limiteur Upstash par couple (limit, windowMs) rencontré dans l'app,
// réutilisé entre les appels : nécessaire pour que l'algorithme de fenêtre
// glissante d'Upstash fonctionne correctement.
const upstashLimiters = new Map<string, Ratelimit>();

function getUpstashLimiter(limit: number, windowMs: number): Ratelimit {
  const cacheKey = `${limit}:${windowMs}`;
  let limiter = upstashLimiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      prefix: "meddoc-ratelimit",
    });
    upstashLimiters.set(cacheKey, limiter);
  }
  return limiter;
}

export async function rateLimit(key: string, limit = 60, windowMs = 60000) {
  if (redis) {
    const limiter = getUpstashLimiter(limit, windowMs);
    const result = await limiter.limit(key);
    return { success: result.success, count: limit - result.remaining };
  }
  return memoryRateLimit(key, limit, windowMs);
}

/**
 * Convenience helper for API routes: returns a ready-to-return 429 response
 * when the IP is over the limit, or null when the request can proceed.
 */
export async function rateLimitOrResponse(req: Request, limit = 60, windowMs = 60000) {
  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  const result = await rateLimit(ip, limit, windowMs);
  if (!result.success) {
    return NextResponse.json(
      { error: "Trop de requêtes. Veuillez réessayer plus tard." },
      { status: 429 }
    );
  }
  return null;
}
