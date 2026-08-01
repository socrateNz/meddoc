"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled global error:", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Une erreur critique est survenue</h1>
            <p style={{ color: "#666", margin: "0.5rem 0 1rem" }}>Veuillez recharger la page.</p>
            <button onClick={() => reset()} style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>
              Réessayer
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
