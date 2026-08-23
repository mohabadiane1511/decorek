import { createFileRoute } from "@tanstack/react-router";
import { ShopLayout, PageHeader } from "@/components/layout/ShopLayout";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/cgv")({
  head: () => ({
    meta: [
      { title: "Conditions générales de vente | Deco'Rek" },
      {
        name: "description",
        content:
          "Conditions de vente Deco'Rek : prix en FCFA, paiement à la livraison, échanges sous 7 jours.",
      },
      { property: "og:title", content: "Conditions générales — Deco'Rek" },
      { property: "og:description", content: "Prix, paiement à la réception et échanges." },
    ],
  }),
  component: Cgv,
});

function Cgv() {
  const { content } = useStore();
  return (
    <ShopLayout>
      <PageHeader title="Conditions générales de vente" />
      <div className="mx-auto max-w-3xl px-4 pb-24">
        <p className="leading-relaxed text-muted-foreground">{content.pages.cgv}</p>
      </div>
    </ShopLayout>
  );
}
