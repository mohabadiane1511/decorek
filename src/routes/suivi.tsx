import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShopLayout, PageHeader } from "@/components/layout/ShopLayout";
import { RecapMontants } from "@/components/shop/RecapMontants";
import { Input } from "@/components/ui/input";
import { OrderTimeline } from "@/components/shop/OrderTimeline";
import { formatFcfa, formatDate } from "@/lib/format";
import type { Order } from "@/data/types";
import { api } from "@/lib/api";
import { statusLabels, useStore } from "@/lib/store";

export const Route = createFileRoute("/suivi")({
  head: () => ({
    meta: [
      { title: "Suivre ma commande | Deco'Rek" },
      {
        name: "description",
        content:
          "Saisissez votre numéro de commande Deco'Rek pour connaître son statut de livraison.",
      },
      { property: "og:title", content: "Suivi de commande — Deco'Rek" },
      { property: "og:description", content: "Suivez votre livraison à Dakar et en régions." },
    ],
  }),
  component: Suivi,
});

function Suivi() {
  const { user } = useStore();
  const [q, setQ] = useState("");
  const [telephone, setTelephone] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  const rechercher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;

    setEnCours(true);
    setErreur("");
    try {
      const trouvee = await api.suivreCommande(q.trim(), telephone.trim() || undefined);
      setOrder(trouvee);
    } catch (e) {
      setOrder(null);
      setErreur(e instanceof Error ? e.message : "Recherche impossible.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <ShopLayout>
      <PageHeader
        title="Suivre ma commande"
        intro="Entrez le numéro reçu à la validation (format DR-XXXX-XXXX)."
      />
      <div className="mx-auto max-w-2xl px-4 pb-20">
        <form onSubmit={(e) => void rechercher(e)} className="space-y-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="DR-2608-1042"
            aria-label="Numéro de commande"
            className="rounded-none"
          />
          {/* Le téléphone n'est demandé qu'aux visiteurs non connectés : un client
              identifié accède directement à ses propres commandes. */}
          {!user && (
            <Input
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="Téléphone utilisé lors de la commande"
              aria-label="Téléphone"
              className="rounded-none"
            />
          )}
          <button
            type="submit"
            disabled={enCours}
            className="btn-square btn-solid w-full disabled:opacity-50"
          >
            {enCours ? "Recherche…" : "Rechercher"}
          </button>
        </form>

        {erreur && <p className="mt-8 text-sm text-muted-foreground">{erreur}</p>}

        {order && (
          <div className="mt-10 border border-border p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-mono text-sm tracking-wider">{order.number}</h2>
              <span className="text-sm text-muted-foreground">{formatDate(order.createdAt)}</span>
            </div>
            <p className="mt-1 text-sm">Statut : {statusLabels[order.status]}</p>
            <div className="mt-6">
              <OrderTimeline status={order.status} />
            </div>
            <ul className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
              {order.items.map((i) => (
                <li key={i.productId} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-3">
                    {i.image ? (
                      <img
                        src={i.image}
                        alt={i.name}
                        loading="lazy"
                        className="h-14 w-14 shrink-0 border border-border object-cover"
                      />
                    ) : (
                      <span className="h-14 w-14 shrink-0 border border-border bg-muted" />
                    )}
                    <span className="min-w-0 truncate text-muted-foreground">
                      {i.name} × {i.quantity}
                    </span>
                  </span>
                  <span>{formatFcfa(i.price * i.quantity)}</span>
                </li>
              ))}
            </ul>

            <RecapMontants order={order} />
          </div>
        )}
      </div>
    </ShopLayout>
  );
}
