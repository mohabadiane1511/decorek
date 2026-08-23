import { createFileRoute } from "@tanstack/react-router";
import { ShopLayout, PageHeader } from "@/components/layout/ShopLayout";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/a-propos")({
  head: () => ({
    meta: [
      { title: "À propos de Deco'Rek — l'art de recevoir au Sénégal" },
      {
        name: "description",
        content:
          "Deco'Rek sélectionne vaisselle, décoration et mobilier de réception pour les intérieurs sénégalais.",
      },
      { property: "og:title", content: "À propos de Deco'Rek" },
      { property: "og:description", content: "Une sélection exigeante pour sublimer vos réceptions." },
    ],
  }),
  component: APropos,
});

function APropos() {
  const { content, products } = useStore();
  const cover = products[0];
  return (
    <ShopLayout>
      <PageHeader title="Notre maison" />
      <div className="mx-auto grid max-w-5xl gap-10 px-4 pb-24 md:grid-cols-2">
        <p className="leading-relaxed text-muted-foreground">{content.pages.apropos}</p>
        {cover && (
          <div className="aspect-[4/3] overflow-hidden bg-sand">
            <img src={cover.images[0]} alt="Sélection Deco'Rek" className="h-full w-full object-cover" />
          </div>
        )}
      </div>
    </ShopLayout>
  );
}
