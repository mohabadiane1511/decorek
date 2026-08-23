import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShopLayout, PageHeader } from "@/components/layout/ShopLayout";
import { Input } from "@/components/ui/input";
import { OrderTimeline } from "@/components/shop/OrderTimeline";
import { formatFcfa, formatDate } from "@/lib/format";
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
  const { orders } = useStore();
  const [q, setQ] = useState("");
  const [searched, setSearched] = useState(false);
  const order = orders.find((o) => o.number.toLowerCase() === q.trim().toLowerCase());

  return (
    <ShopLayout>
      <PageHeader
        title="Suivre ma commande"
        intro="Entrez le numéro reçu à la validation (format DR-XXXX-XXXX)."
      />
      <div className="mx-auto max-w-2xl px-4 pb-20">
        <div className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="DR-2608-1042"
            className="rounded-none"
          />
          <button onClick={() => setSearched(true)} className="btn-square btn-solid">
            Rechercher
          </button>
        </div>

        {searched && !order && (
          <p className="mt-8 text-sm text-muted-foreground">
            Aucune commande ne correspond à ce numéro.
          </p>
        )}

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

            <div className="mt-4 flex justify-between border-t border-border pt-4 text-sm">
              <span>Total</span>
              <span>{formatFcfa(order.total)}</span>
            </div>
          </div>
        )}
      </div>
    </ShopLayout>
  );
}
