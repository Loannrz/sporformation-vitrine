import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: ".",
  publicDir: "public",
  /* Permet d'utiliser les mêmes noms que Next.js (NEXT_PUBLIC_SUPABASE_*) dans .env.local */
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  server: {
    host: true,
    port: 5173,
    open: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        formations: resolve(__dirname, "formations.html"),
        apprentissage: resolve(__dirname, "apprentissage.html"),
        aPropos: resolve(__dirname, "a-propos.html"),
        handicap: resolve(__dirname, "handicap.html"),
        tep: resolve(__dirname, "tep.html"),
        contact: resolve(__dirname, "contact.html"),
        formulaireEmployeur: resolve(__dirname, "formulaire-employeur.html"),
        mentionsLegales: resolve(__dirname, "mentions-legales.html"),
        confidentialite: resolve(__dirname, "politique-de-confidentialite.html"),
        certificatQualiopi: resolve(__dirname, "certificat-qualiopi.html"),
        inscriptionPrepaTep: resolve(__dirname, "inscription-prepa-tep.html"),
      },
    },
  },
  css: {
    devSourcemap: true,
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
      },
    },
  },
});
