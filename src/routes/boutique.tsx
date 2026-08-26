import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ShopLayout, PageHeader } from "@/components/layout/ShopLayout";
import { ProductCard } from "@/components/shop/ProductCard";
import { SqueletteGrilleProduits } from "@/components/shop/Squelettes";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { api, type FiltresProduits } from "@/lib/api";
import { formatFcfa } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useDebounce } from "@/lib/useDebounce";

type Search = { categorie?: string | undefined; q?: string | undefined };

export const Route = createFileRoute("/boutique")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    categorie: typeof search["categorie"] === "string" ? search["categorie"] : undefined,
    q: typeof search["q"] === "string" ? search["q"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Boutique — Vaisselle & décoration | Deco'Rek" },
      {
        name: "description",
        content:
          "Parcourez le catalogue Deco'Rek : art de la table, décoration murale, textile, mobilier de réception. Prix en FCFA.",
      },
      { property: "og:title", content: "Boutique Deco'Rek" },
      {
        property: "og:description",
        content: "Catalogue complet de vaisselle et décoration, livré à Dakar et en régions.",
      },
    ],
  }),
  component: Boutique,
});

const PAGE_SIZE = 8;
type Tri = "recent" | "prix-asc" | "prix-desc";

function Boutique() {
  const { products, categories } = useStore();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/boutique" });

  const maxPrice = useMemo(() => Math.max(50000, ...products.map((p) => p.price)), [products]);
  const [priceMax, setPriceMax] = useState(maxPrice);
  const [sort, setSort] = useState<Tri>("recent");
  const [page, setPage] = useState(1);

  // Le maximum n'est connu qu'une fois le catalogue chargé : on aligne le curseur
  // dessus, sans quoi il resterait bloqué sur la valeur de repli.
  useEffect(() => setPriceMax(maxPrice), [maxPrice]);

  const activeCategory = categories.find((c) => c.slug === search.categorie);
  const qRetardee = useDebounce(search.q ?? "");
  const prixRetarde = useDebounce(priceMax);

  const filtres: FiltresProduits = {
    categorie: search.categorie,
    q: qRetardee || undefined,
    prixMax: prixRetarde < maxPrice ? prixRetarde : undefined,
    tri: sort,
    page,
    parPage: PAGE_SIZE,
  };

  // Le filtrage, le tri et la pagination sont faits par l'API : le navigateur ne reçoit
  // qu'une page à la fois, ce qui reste tenable quand le catalogue grandit.
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["produits", filtres],
    queryFn: ({ signal }) => api.produits(filtres, signal),
    // Garde la page précédente affichée pendant le chargement de la suivante, au lieu
    // de vider la grille à chaque changement de filtre.
    placeholderData: keepPreviousData,
  });

  // Un filtre plus restrictif peut rendre la page courante inexistante.
  useEffect(() => {
    if (data && page > data.pages) setPage(data.pages);
  }, [data, page]);

  const setCategory = (slug?: string) => {
    setPage(1);
    void navigate({ search: (prev: Search) => ({ ...prev, categorie: slug }) });
  };

  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  return (
    <ShopLayout>
      <PageHeader
        index="01 — Collection complète"
        title={activeCategory ? activeCategory.name : "La boutique"}
        intro={
          activeCategory
            ? activeCategory.description
            : "Toutes nos pièces, du dressage de table au mobilier de réception."
        }
        aside={isPending ? "…" : `${total} pièce${total > 1 ? "s" : ""}`}
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="label-mono mb-3 text-muted-foreground">Catégorie</p>
        {/* Une rangée qui défile sur téléphone, et qui revient à la ligne dès qu'il y a
            la place. Le cadre unique et le retour à la ligne donnaient un pavé
            irrégulier sur un écran étroit : les intitulés longs occupaient toute la
            largeur, les courts se serraient à deux, sans rien pour les séparer.
            Le débord jusqu'aux bords de l'écran montre qu'il reste des catégories à
            droite, plutôt que de les laisser deviner. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <button
            onClick={() => setCategory(undefined)}
            className={`label-mono shrink-0 border px-4 py-3 whitespace-nowrap transition-colors ${
              !activeCategory
                ? "border-foreground bg-foreground text-background"
                : "border-border hover:bg-muted"
            }`}
          >
            Tout
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.slug)}
              className={`label-mono shrink-0 border px-4 py-3 whitespace-nowrap transition-colors ${
                activeCategory?.id === c.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:bg-muted"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 border-y border-border py-5 sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <Input
            placeholder="Rechercher un article…"
            value={search.q ?? ""}
            onChange={(e) => {
              setPage(1);
              void navigate({
                search: (prev: Search) => ({ ...prev, q: e.target.value || undefined }),
              });
            }}
            className="rounded-none"
          />
          <div className="min-w-52">
            <div className="label-mono flex items-center justify-between text-muted-foreground">
              <span>Prix max</span>
              <span>{formatFcfa(priceMax)}</span>
            </div>
            <Slider
              className="mt-2"
              min={5000}
              max={maxPrice}
              step={500}
              value={[priceMax]}
              onValueChange={(v) => {
                setPage(1);
                setPriceMax(v[0] ?? maxPrice);
              }}
            />
          </div>
          <select
            value={sort}
            onChange={(e) => {
              setPage(1);
              setSort(e.target.value as Tri);
            }}
            className="label-mono h-9 border border-input bg-background px-3"
            aria-label="Trier"
          >
            <option value="recent">Nouveautés</option>
            <option value="prix-asc">Prix croissant</option>
            <option value="prix-desc">Prix décroissant</option>
          </select>
        </div>

        {isError ? (
          <div className="py-20 text-center">
            <p className="text-muted-foreground">
              {error instanceof Error ? error.message : "Impossible de charger le catalogue."}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="btn-square btn-outline mt-6"
            >
              Réessayer
            </button>
          </div>
        ) : isPending ? (
          <SqueletteGrilleProduits nombre={PAGE_SIZE} />
        ) : data.items.length === 0 ? (
          <p className="py-20 text-center text-muted-foreground">
            Aucun article ne correspond à votre recherche.
          </p>
        ) : (
          <div
            className={`mt-12 grid grid-cols-2 gap-x-6 gap-y-14 transition-opacity md:grid-cols-3 xl:grid-cols-4 ${
              isFetching ? "opacity-60" : ""
            }`}
          >
            {data.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}

        {pages > 1 && (
          <div className="mt-12 flex justify-center gap-2">
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`label-mono h-10 w-10 border transition-colors ${
                  n === page
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-muted"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
    </ShopLayout>
  );
}
