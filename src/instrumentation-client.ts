import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Pas d'envoi depuis le poste de développement : un serveur local arrêté ou en cours de
  // redémarrage remonte sinon des « Failed to fetch » qui polluent les erreurs de production.
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NODE_ENV === "production",
  // Taux volontairement bas : limite le volume de trafic de télémétrie envoyé à chaque
  // navigation sans perdre la remontée d'erreurs (non concernée par ce taux, toujours à 100%).
  // Suffisant pour dégager des tendances de performance dans la durée.
  tracesSampleRate: 0.02,
  // Bruit des navigateurs intégrés (Facebook, Instagram, Messenger…) : leurs propres scripts
  // injectés (app://…, pont Java Android) lèvent des erreurs quand l'utilisateur ferme la page
  // ou bascule d'application. Ce n'est pas du code MedDoc et on ne peut rien y corriger.
  ignoreErrors: ["Java object is gone", /Error invoking postMessage/],
  denyUrls: [/^app:\/\//],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
