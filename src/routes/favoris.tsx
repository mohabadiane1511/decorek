import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShopLayout, PageHeader } from "@/components/layout/ShopLayout";
import { ProductCard } from "@/components/shop/ProductCard";
import { SqueletteGrilleProduits } from "@/components/shop/Squelettes";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/favoris")({
  head: () => ({
    meta: [
      { title: "Mes favoris | Deco'Rek" },
      {
        name: "description",
        content: "Retrouvez les pièces Deco'Rek que vous avez mises de côté.",
      },
      { property: "og:title", content: "Mes favoris — Deco'Rek" },
    ],
  }),
  component: Favoris,
});

function Favoris() {
  const { favoris } = useStore();

  // Les articles sont relus à l'ouverture plutôt que pris dans le catalogue déjà
  // chargé : un favori mis de côté il y a des semaines peut avoir changé de prix,
  // être épuisé, ou avoir disparu de la vitrine.
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["favoris", favoris],
    queryFn: async ({ signal }) => {
      // Un seul appel, puis filtrage : interroger l'API une fois par favori
      // multiplierait les requêtes sans rien apporter.
      const page = await api.produits({ parPage: 48 }, signal);
      const parId = new Map(page.items.map((p) => [p.id, p]));
      // L'ordre suit celui des favoris, le plus récent d'abord.
      return favoris.map((id) => parId.get(id)).filter((p) => p !== undefined);
    },
    enabled: favoris.length > 0,
  });

  if (favoris.length === 0) {
    return (
      <ShopLayout>
        <PageHeader
          index="Mes favoris"
          title="Aucun favori pour l'instant"
          intro="Touchez le cœur sur un article pour le retrouver ici. La liste reste sur cet appareil."
        />
        <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
          <Link to="/boutique" className="btn-square btn-solid">
            Parcourir la boutique
          </Link>
        </div>
      </ShopLayout>
    );
  }

  return (
    <ShopLayout>
      <PageHeader
        index="Mes favoris"
        title="Vos pièces mises de côté"
        intro="Cette liste est enregistrée sur cet appareil : elle ne suit pas d'un téléphone à l'autre."
        aside={`${favoris.length} pièce${favoris.length > 1 ? "s" : ""}`}
      />

      <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        {isError ? (
          <div className="py-20 text-center">
            <p className="text-muted-foreground">Impossible de charger vos favoris.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="btn-square btn-outline mt-6"
            >
              Réessayer
            </button>
          </div>
        ) : isPending ? (
          <SqueletteGrilleProduits nombre={Math.min(favoris.length, 8)} />
        ) : data.length === 0 ? (
          // Les articles ont disparu de la vitrine depuis leur mise de côté.
          <p className="py-20 text-center text-muted-foreground">
            Les articles que vous aviez mis de côté ne sont plus disponibles.
          </p>
        ) : (
          <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-14 md:grid-cols-3 xl:grid-cols-4">
            {data.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </ShopLayout>
  );
}
