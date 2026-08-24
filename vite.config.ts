// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const PORT_API = process.env["API_PORT"] ?? "53000";
const PORT_MEDIA = process.env["MINIO_PORT"] ?? "59000";
const BUCKET = process.env["MINIO_BUCKET"] ?? "decorek-media";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      // Reproduit en développement ce que fera Caddy en production : un seul domaine,
      // /api vers l'API et /media vers le stockage. Le front n'a donc jamais d'URL
      // absolue à connaître, et il n'y a ni CORS ni cookies tiers à gérer.
      proxy: {
        "/api": {
          target: `http://localhost:${PORT_API}`,
          changeOrigin: true,
          // Transmet X-Forwarded-For. Sans cela l'API ne voit qu'une seule adresse —
          // celle du proxy — et la limitation de débit compte tous les visiteurs
          // ensemble : le premier à atteindre le seuil bloque tout le monde.
          xfwd: true,
        },
        "/media": {
          target: `http://localhost:${PORT_MEDIA}`,
          changeOrigin: true,
          rewrite: (chemin: string) => chemin.replace(/^\/media/, `/${BUCKET}`),
        },
      },
    },
  },
});
