"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Les données cliniques changent au fil des actions d'autres soignants —
            // pas assez volatiles pour un refetch à chaque rendu, pas assez stables pour
            // un cache long. 30s laisse la navigation entre onglets déjà visités être
            // instantanée tout en revalidant vite en arrière-plan.
            staleTime: 30 * 1000,
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
