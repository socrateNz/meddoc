import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Taux volontairement bas : limite le volume de trafic de télémétrie envoyé à chaque
  // navigation sans perdre la remontée d'erreurs (non concernée par ce taux, toujours à 100%).
  // Suffisant pour dégager des tendances de performance dans la durée.
  tracesSampleRate: 0.02,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
