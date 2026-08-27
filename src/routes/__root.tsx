import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { StoreProvider } from "@/lib/store";
import { api } from "@/lib/api";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="title-xl">404</h1>
        <h2 className="mt-4 title-lg">Page introuvable</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Cette page n'existe pas ou a été déplacée.
        </p>
        <div className="mt-6">
          <Link to="/" className="btn-square btn-solid">
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="title-lg">Cette page n'a pas pu se charger</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Une erreur est survenue. Réessayez ou revenez à l'accueil.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="btn-square btn-solid"
          >
            Réessayer
          </button>
          <a href="/" className="btn-square btn-outline">
            Accueil
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Deco'Rek — Vaisselle & décoration au Sénégal" },
      {
        name: "description",
        content:
          "Vaisselle, décoration et mobilier de réception à Dakar. Paiement à la livraison, prix en FCFA.",
      },
      { name: "author", content: "Deco'Rek" },
      { property: "og:title", content: "Deco'Rek — Vaisselle & décoration au Sénégal" },
      {
        property: "og:description",
        content: "Vaisselle, décoration et mobilier de réception à Dakar. Paiement à la livraison.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap",
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  /**
   * Données publiques chargées avant le rendu, donc présentes dans le HTML servi.
   *
   * Elles arrivaient auparavant depuis le navigateur, et la mise en page masquait tout
   * le contenu en attendant : ce que recevait un robot — ou l'aperçu WhatsApp, qui
   * n'exécute aucun script — était un écran d'attente.
   *
   * Une panne ici ne doit pas empêcher la page de s'afficher : le navigateur reprendra
   * le chargement, et l'écran « boutique indisponible » lui appartient.
   */
  loader: async () => {
    try {
      return await api.amorce();
    } catch {
      return null;
    }
  },

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const donnees = Route.useLoaderData();

  // Marque la page comme interactive. Le contenu étant rendu par le serveur, il
  // s'affiche avant que le script ne soit prêt : un clic émis dans cet intervalle est
  // perdu. Ce repère permet de savoir quand l'interface répond réellement — les tests
  // s'en servent, et il aide à diagnostiquer une hydratation qui échoue.
  useEffect(() => {
    document.documentElement.dataset["pret"] = "1";
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider donneesInitiales={donnees}>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster position="top-center" />
      </StoreProvider>
    </QueryClientProvider>
  );
}
