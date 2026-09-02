export function appendSecurityHeaders(headers: Headers) {
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // 'unsafe-eval' est nécessaire au Fast Refresh de Next.js en développement,
  // quel que soit le bundler (webpack ou Turbopack) — mais pas en production.
  // 'wasm-unsafe-eval' reste nécessaire dans les DEUX environnements : @react-pdf/renderer
  // compile son moteur de mise en page (yoga-layout) en WebAssembly via WebAssembly.instantiate(),
  // ce que Chrome/Firefox traitent comme une forme d'eval y compris pour du WASM légitime — sans
  // cette entrée, la génération de PDF échouait immédiatement en production ("Impossible de
  // générer le PDF"), alors qu'elle fonctionnait en développement où 'unsafe-eval' (plus large)
  // couvrait aussi ce cas. 'wasm-unsafe-eval' autorise spécifiquement la compilation WASM sans
  // réintroduire eval()/Function() sur du texte arbitraire — vérifié en testant un vrai
  // téléchargement de PDF contre un build de production local (next build && next start).
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval';"
    : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval';";

  // Élargit connect-src pour l'ingestion Sentry uniquement si un DSN client
  // est configuré (sinon Sentry.init() est désactivé et rien n'est envoyé).
  // "data:" est nécessaire à la génération PDF (@react-pdf/renderer charge son moteur de mise
  // en page interne — yoga-layout, compilé en WebAssembly — via fetch() sur un data: URI) :
  // vérifié en testant réellement un téléchargement de PDF en conditions réelles, qui restait
  // bloqué indéfiniment ("ça cale sur génération") sans cette entrée, le fetch et le worker
  // WASM étant tous deux silencieusement bloqués par le CSP.
  const connectSrc = process.env.NEXT_PUBLIC_SENTRY_DSN
    ? "connect-src 'self' data: https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io;"
    : "connect-src 'self' data:;";

  headers.set(
    "Content-Security-Policy",
    // worker-src 'self' blob: : même moteur PDF, qui exécute ensuite ce WASM dans un Web Worker
    // instancié depuis un blob: URL — sans worker-src explicite, le navigateur retombe sur
    // script-src (qui n'autorise pas blob:) et bloque la création du worker.
    `default-src 'self'; ${scriptSrc} style-src 'self' 'unsafe-inline'; img-src 'self' data: https://res.cloudinary.com; worker-src 'self' blob:; ${connectSrc}`
  );
}
