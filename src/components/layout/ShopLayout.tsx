import type { ReactNode } from "react";
import { SqueletteAccueil } from "@/components/shop/Squelettes";
import { useStore } from "@/lib/store";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { WhatsAppButton } from "./WhatsAppButton";

/**
 * Attend que le catalogue soit chargé avant d'afficher la page.
 *
 * Sans cette attente, chaque écran afficherait brièvement une boutique vide — « 0 pièce »,
 * des collections absentes — avant que les données n'arrivent, ce qui ressemble à une
 * panne. En cas d'échec, on montre un message et un bouton pour réessayer, jamais une
 * page blanche.
 */
function Chargement() {
  // Silhouette plutôt qu'un texte : sur une connexion lente, une page qui prend forme
  // paraît plus rapide qu'un écran vide, même à durée égale.
  return <SqueletteAccueil />;
}

function Indisponible({ message, reessayer }: { message: string; reessayer: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="section-index">Boutique indisponible</p>
      <h1 className="title-lg mt-5 max-w-xl">{message}</h1>
      <p className="mt-6 max-w-md text-muted-foreground">
        Le service est momentanément injoignable. Vous pouvez réessayer dans un instant.
      </p>
      <button type="button" onClick={reessayer} className="btn-square btn-solid mt-8">
        Réessayer
      </button>
    </div>
  );
}

export function ShopLayout({ children }: { children: ReactNode }) {
  const { ready, erreurChargement, rafraichir } = useStore();

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      {!ready ? (
        <Chargement />
      ) : erreurChargement ? (
        <Indisponible message={erreurChargement} reessayer={rafraichir} />
      ) : (
        <main className="flex-1">{children}</main>
      )}
      <Footer />
      <WhatsAppButton />
    </div>
  );
}

export function PageHeader({
  title,
  intro,
  index,
  aside,
}: {
  title: string;
  intro?: string;
  index?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-12 pb-8 sm:px-6 sm:pt-16">
      {index && <p className="section-index">{index}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <h1 className="title-xl">{title}</h1>
        {aside && <div className="label-mono text-muted-foreground sm:text-right">{aside}</div>}
      </div>
      {intro && <p className="mt-6 max-w-2xl text-muted-foreground">{intro}</p>}
      <div className="mt-8 border-b border-border" />
    </div>
  );
}
