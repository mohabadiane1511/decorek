import { createFileRoute } from "@tanstack/react-router";
import { ShopLayout, PageHeader } from "@/components/layout/ShopLayout";
import { formatFcfa } from "@/lib/format";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/livraison")({
  head: () => ({
    meta: [
      { title: "Livraison & paiement à la réception | Deco'Rek" },
      {
        name: "description",
        content:
          "Zones et frais de livraison à Dakar, en banlieue et en régions. Paiement uniquement à la livraison.",
      },
      { property: "og:title", content: "Livraison & paiement — Deco'Rek" },
      {
        property: "og:description",
        content: "Tarifs par quartier et par région, délais 24h à 5 jours.",
      },
    ],
  }),
  component: Livraison,
});

function Livraison() {
  const { content, regions } = useStore();
  return (
    <ShopLayout>
      <PageHeader title="Livraison & paiement" />
      <div className="mx-auto max-w-4xl px-4 pb-24">
        <p className="max-w-2xl leading-relaxed text-muted-foreground">{content.pages.livraison}</p>
        <p className="mt-4 text-sm">
          Livraison offerte à partir de {formatFcfa(content.freeShippingFrom)} d'achat.
        </p>

        <div className="mt-12 space-y-8">
          {regions.map((r) => (
            <section key={r.id}>
              <h2 className="font-display text-xl tracking-tight">{r.name}</h2>
              <ul className="mt-4 divide-y divide-border border-y border-border">
                {r.areas.map((a) => (
                  <li key={a.id} className="flex justify-between py-3 text-sm">
                    <span className="text-muted-foreground">{a.name}</span>
                    <span>{formatFcfa(a.fee)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </ShopLayout>
  );
}
