import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Adresse explicite : « localhost » se résout en ::1 sous Windows, et le
    // serveur de dev devient injoignable en 127.0.0.1 (≈ 2,4 s par requête).
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      // Jamais « localhost » : la résolution IPv6 coûte ~2,4 s par requête sous Windows.
      // `changeOrigin: false` garde l'en-tête Host du navigateur (127.0.0.1:5173) :
      // la garde d'origine du serveur compare Origin et Host, et refuserait (403)
      // toute mutation si le proxy réécrivait Host vers 127.0.0.1:3001.
      "/api": { target: "http://127.0.0.1:3001", changeOrigin: false },
    },
  },
});
