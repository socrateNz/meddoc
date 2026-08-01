export function appendSecurityHeaders(headers: Headers) {
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // 'unsafe-eval' est nécessaire au Fast Refresh de Next.js en développement,
  // quel que soit le bundler (webpack ou Turbopack) — mais pas en production.
  // À vérifier une fois déployé (assistant IA, génération PDF) avant de
  // considérer ce durcissement définitivement acquis.
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval';"
    : "script-src 'self' 'unsafe-inline';";

  // Élargit connect-src pour l'ingestion Sentry uniquement si un DSN client
  // est configuré (sinon Sentry.init() est désactivé et rien n'est envoyé).
  const connectSrc = process.env.NEXT_PUBLIC_SENTRY_DSN
    ? "connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io;"
    : "connect-src 'self';";

  headers.set(
    "Content-Security-Policy",
    `default-src 'self'; ${scriptSrc} style-src 'self' 'unsafe-inline'; img-src 'self' data: https://res.cloudinary.com; ${connectSrc}`
  );
}
