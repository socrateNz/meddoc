import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "etarcos-dev",

  project: "javascript-nextjs-br",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Pas de tunnelRoute : les événements partent directement vers l'ingestion Sentry plutôt que
  // d'être relayés par notre propre serveur. Chaque envoi tunnelé était mesuré à 1,4-2,8s (un
  // aller-retour serveur supplémentaire) ; en direct, le navigateur parle à Sentry sans passer
  // par nous. Coût accepté : les utilisateurs avec un bloqueur de pub actif peuvent bloquer ces
  // requêtes (domaine *.sentry.io reconnaissable), donc leurs erreurs ne remontent pas — jugé
  // préférable à la latence du tunnel pour cette appli. CSP déjà ouverte pour l'ingestion
  // directe (cf. src/middlewares/securityHeaders.ts, connect-src).

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
