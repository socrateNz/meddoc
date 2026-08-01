import { NextResponse } from "next/server";

const ipCache = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(ip: string, limit = 60, windowMs = 60000) {
  const now = Date.now();
  const cache = ipCache.get(ip);

  if (!cache) {
    ipCache.set(ip, { count: 1, resetTime: now + windowMs });
    return { success: true, count: 1 };
  }

  if (now > cache.resetTime) {
    cache.count = 1;
    cache.resetTime = now + windowMs;
    return { success: true, count: 1 };
  }

  cache.count++;
  if (cache.count > limit) {
    return { success: false, count: cache.count };
  }

  return { success: true, count: cache.count };
}

/**
 * Convenience helper for API routes: returns a ready-to-return 429 response
 * when the IP is over the limit, or null when the request can proceed.
 */
export function rateLimitOrResponse(req: Request, limit = 60, windowMs = 60000) {
  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  const result = rateLimit(ip, limit, windowMs);
  if (!result.success) {
    return NextResponse.json(
      { error: "Trop de requêtes. Veuillez réessayer plus tard." },
      { status: 429 }
    );
  }
  return null;
}
