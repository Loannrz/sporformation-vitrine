import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";

/** URLs courtes : /admin, /login, /portail, /compte/* → fichiers HTML (idem public/_redirects en prod). */
function shortHtmlRoutesPlugin() {
  const rewriteUrl = (req) => {
    const raw = req.url || "";
    const q = raw.indexOf("?");
    const pathname = q >= 0 ? raw.slice(0, q) : raw;
    const search = q >= 0 ? raw.slice(q) : "";
    if (pathname === "/admin" || pathname === "/admin/") {
      req.url = `/admin.html${search}`;
    } else if (pathname === "/login" || pathname === "/login/") {
      req.url = `/login.html${search}`;
    } else if (pathname === "/portail" || pathname === "/portail/") {
      req.url = `/portail.html${search}`;
    } else if (pathname === "/portail/verifier" || pathname === "/portail/verifier/") {
      req.url = `/portail-verifier.html${search}`;
    } else if (pathname === "/compte/tableau-de-bord" || pathname === "/compte/tableau-de-bord/") {
      req.url = `/compte-tableau-de-bord.html${search}`;
    } else if (pathname === "/compte/inscription" || pathname === "/compte/inscription/") {
      req.url = `/compte-inscription.html${search}`;
    } else if (pathname === "/compte/parametres" || pathname === "/compte/parametres/") {
      req.url = `/compte-parametres.html${search}`;
    }
  };
  return {
    name: "short-html-routes",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewriteUrl(req);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewriteUrl(req);
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = String(env.FORMS_API_PORT || "3001").trim() || "3001";

  return {
  plugins: [shortHtmlRoutesPlugin()],
  root: ".",
  publicDir: "public",
  /* Permet d'utiliser les mêmes noms que Next.js (NEXT_PUBLIC_SUPABASE_*) dans .env.local */
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  /** Évite les erreurs de résolution / pré-bundle incomplets sur @supabase/supabase-js (postgrest, realtime…). */
  optimizeDeps: {
    include: [
      "@supabase/supabase-js",
      "@supabase/postgrest-js",
      "@supabase/realtime-js",
      "@supabase/storage-js",
      "@supabase/functions-js",
      "@supabase/auth-js",
    ],
  },
  server: {
    host: true,
    port: 5173,
    open: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    port: 4173,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
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
        formationDetail: resolve(__dirname, "formation-detail.html"),
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
        login: resolve(__dirname, "login.html"),
        admin: resolve(__dirname, "admin.html"),
        portail: resolve(__dirname, "portail.html"),
        portailVerifier: resolve(__dirname, "portail-verifier.html"),
        compteDashboard: resolve(__dirname, "compte-tableau-de-bord.html"),
        compteInscription: resolve(__dirname, "compte-inscription.html"),
        compteParametres: resolve(__dirname, "compte-parametres.html"),
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
};
});
