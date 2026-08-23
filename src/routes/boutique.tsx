import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ShopLayout, PageHeader } from "@/components/layout/ShopLayout";
import { ProductCard } from "@/components/shop/ProductCard";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { formatFcfa } from "@/lib/format";
import { useStore } from "@/lib/store";

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

function Boutique() {
  const { products, categories } = useStore();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/boutique" });

  const maxPrice = useMemo(() => Math.max(50000, ...products.map((p) => p.price)), [products]);
  const [priceMax, setPriceMax] = useState(maxPrice);
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);

  const activeCategory = categories.find((c) => c.slug === search.categorie);
  const query = (search.q ?? "").toLowerCase();

  const filtered = useMemo(() => {
    const list = products.filter(
      (p) =>
        (!activeCategory || p.categoryId === activeCategory.id) &&
        p.price <= priceMax &&
        (!query || p.name.toLowerCase().includes(query)),
    );
    if (sort === "prix-asc") list.sort((a, b) => a.price - b.price);
    else if (sort === "prix-desc") list.sort((a, b) => b.price - a.price);
    else list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list;
  }, [products, activeCategory, priceMax, query, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const setCategory = (slug?: string) => {
    setPage(1);
    void navigate({ search: (prev: Search) => ({ ...prev, categorie: slug }) });
  };

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
        aside={`${filtered.length} pièce${filtered.length > 1 ? "s" : ""}`}
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="label-mono mb-3 text-muted-foreground">Catégorie</p>
        <div className="flex flex-wrap gap-0 border border-border">
          <button
            onClick={() => setCategory(undefined)}
            className={`label-mono px-4 py-3 transition-colors ${
              !activeCategory ? "bg-foreground text-background" : "hover:bg-muted"
            }`}
          >
            Tout
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.slug)}
              className={`label-mono px-4 py-3 transition-colors ${
                activeCategory?.id === c.id ? "bg-foreground text-background" : "hover:bg-muted"
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
            onChange={(e) => setSort(e.target.value)}
            className="label-mono h-9 border border-input bg-background px-3"
            aria-label="Trier"
          >
            <option value="recent">Nouveautés</option>
            <option value="prix-asc">Prix croissant</option>
            <option value="prix-desc">Prix décroissant</option>
          </select>
        </div>

        {visible.length === 0 ? (
          <p className="py-20 text-center text-muted-foreground">
            Aucun article ne correspond à votre recherche.
          </p>
        ) : (
          <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-14 md:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => (
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
                  n === current
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
