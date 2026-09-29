import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    // Depuis Node 25, un `localStorage` natif (Web Storage) est posé sur `globalThis`
    // et masque celui de jsdom : il est vide de méthodes et se plaint sans fichier
    // (`--localstorage-file`). On le coupe dans les processus de test pour que
    // `window.localStorage` soit le vrai `Storage` de jsdom, comme dans un navigateur.
    // Node 22.4+ connaît ce drapeau, donc la CI (Node 24) l'accepte aussi.
    poolOptions: {
      forks: { execArgv: ["--no-experimental-webstorage"] },
    },
  },
});
