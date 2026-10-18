import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts"],
    // Les rendus PDF (react-pdf) dépassent parfois les 5 s par défaut quand toute la suite tourne
    // en parallèle ; les tests conditionnant le déploiement, un tel faux échec bloquerait une
    // mise en ligne pour rien.
    testTimeout: 20000,
  },
});
