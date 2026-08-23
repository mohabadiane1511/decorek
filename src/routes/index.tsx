import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ShopLayout } from "@/components/layout/ShopLayout";
import { ProductCard } from "@/components/shop/ProductCard";
import { useStore } from "@/lib/store";
import { SITE_URL } from "@/lib/site";

const heroBg = "/images/hero-napkin.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Deco'Rek — Vaisselle, décoration & mobilier à Dakar" },
      {
        name: "description",
        content:
          "Boutique sénégalaise de vaisselle, décoration et mobilier de réception. Prix en FCFA, livraison à Dakar et en régions, paiement à la livraison.",
      },
      { property: "og:title", content: "Deco'Rek — Vaisselle, décoration & mobilier à Dakar" },
      {
        property: "og:description",
        content: "L'art de recevoir, version sénégalaise. Paiement à la livraison.",
      },
      { property: "og:image", content: `${SITE_URL}${heroBg}` },
      { name: "twitter:image", content: `${SITE_URL}${heroBg}` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { content, products, categories } = useStore();
  const featured = products.filter((p) => p.featured).slice(0, 4);
  const nouveautes = [...products]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4);
  const collections = categories.slice(0, 2);

  return (
    <ShopLayout>
      {/* 01 — Héro plein écran */}
      <section className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-foreground">
        {/* Image de fond + voile */}
        <div className="hero-bg absolute inset-0">
          <img
            src={heroBg}
            alt="Art de la table — Maison Deco'Rek"
            className="h-full w-full scale-105 object-cover object-center blur-[2px]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/75" />
        </div>

        {/* Contenu centré */}
        <div className="fade-up relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center px-4 text-center sm:px-6">
          <p className="label-mono mb-6 text-white/60 sm:mb-8">Maison Deco'Rek — Dakar, Sénégal</p>
          <h1 className="title-xl text-white">
            L'art de recevoir<span className="text-accent">.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[0.95rem] leading-relaxed text-white/80 sm:mt-8 sm:text-base">
            {content.bannerSubtitle}
          </p>
          <Link
            to="/boutique"
            className="btn-square btn-solid mt-8 sm:mt-10"
          >
            {content.bannerCta}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* Bande de réassurance */}
      <div className="border-b border-border bg-accent">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-white/15 md:grid-cols-4">
          {["Paiement à la réception", "Livraison régions", "Vaisselle & décoration", "Conseil WhatsApp"].map(
            (t, i) => (
              <p
                key={t}
                className={`label-mono px-4 py-5 text-center leading-tight text-white sm:px-6 ${
                  i > 1 ? "border-t border-white/15 md:border-t-0" : ""
                } ${i === 2 ? "border-l-0 md:border-l" : ""}`}
              >
                {t}
              </p>
            ),
          )}
        </div>
      </div>




      {/* 02 — Collections */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <p className="section-index">02 / 05 — Collections</p>
        <h2 className="title-lg mt-5 max-w-2xl">
          L'art de recevoir,
          <br />
          pièce par pièce.
        </h2>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {collections.map((c) => {
            const cover = products.find((p) => p.categoryId === c.id);
            return (
              <Link
                key={c.id}
                to="/boutique"
                search={{ categorie: c.slug }}
                className="group relative block aspect-[16/11] max-h-[500px] overflow-hidden bg-sand"
              >
                {cover && (
                  <img
                    src={cover.images[0]}
                    alt={c.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                <div className="absolute inset-x-6 bottom-6 grid gap-3 text-white sm:flex sm:items-end sm:justify-between">
                  <div>
                    <p className="label-mono opacity-80">Collection</p>
                    <p className="title-lg mt-1 text-white">{c.name}</p>
                  </div>
                  <span className="link-underline shrink-0 [white-space:nowrap]">
                    Voir la collection <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 03 — Sélection */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <p className="section-index">03 / 05 — Sélection</p>
            <h2 className="title-lg mt-5">
              Les pièces
              <br />
              du moment.
            </h2>
          </div>
          <Link to="/boutique" className="link-underline shrink-0 [white-space:nowrap]">
            Toute la boutique <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* 04 — Nouveautés */}
      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <p className="section-index">04 / 05 — Arrivages</p>
        <h2 className="title-lg mt-5">Nouveautés.</h2>
        <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
          {nouveautes.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </ShopLayout>
  );
}
