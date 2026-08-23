import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2 } from "lucide-react";
import { ShopLayout, PageHeader } from "@/components/layout/ShopLayout";
import { formatFcfa } from "@/lib/format";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/panier")({
  head: () => ({
    meta: [
      { title: "Votre panier | Deco'Rek" },
      {
        name: "description",
        content: "Vérifiez vos articles avant de commander. Paiement à la livraison, prix en FCFA.",
      },
      { property: "og:title", content: "Votre panier — Deco'Rek" },
      { property: "og:description", content: "Finalisez votre sélection Deco'Rek." },
    ],
  }),
  component: Panier,
});

function Panier() {
  const { cart, products, setCartQuantity, removeFromCart, cartSubtotal, content } = useStore();

  const lines = cart
    .map((l) => ({ line: l, product: products.find((p) => p.id === l.productId) }))
    .filter((x) => x.product);

  if (lines.length === 0) {
    return (
      <ShopLayout>
        <div className="mx-auto max-w-6xl px-4 py-24 text-center">
          <h1 className="title-lg">Votre panier est vide</h1>
          <p className="mt-3 text-muted-foreground">
            Parcourez la boutique pour composer votre table.
          </p>
          <Link to="/boutique" className="btn-square btn-solid mt-8">
            Voir la boutique
          </Link>
        </div>
      </ShopLayout>
    );
  }

  return (
    <ShopLayout>
      <PageHeader title="Votre panier" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 lg:grid-cols-[1fr_360px]">
        <div className="divide-y divide-border border-y border-border">
          {lines.map(({ line, product }) => (
            <div key={line.productId} className="flex gap-4 py-5">
              <img
                src={product!.images[0]}
                alt={product!.name}
                className="h-24 w-24 shrink-0 object-cover"
              />
              <div className="min-w-0 flex-1">
                <Link
                  to="/produit/$slug"
                  params={{ slug: product!.slug }}
                  className="text-[0.95rem] hover:underline"
                >
                  {product!.name}
                </Link>
                <p className="text-sm text-muted-foreground">{formatFcfa(product!.price)}</p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex items-center border border-border">
                    <button
                      className="grid h-9 w-9 place-items-center hover:bg-muted"
                      aria-label="Diminuer"
                      onClick={() => setCartQuantity(line.productId, line.quantity - 1)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm">{line.quantity}</span>
                    <button
                      className="grid h-9 w-9 place-items-center hover:bg-muted"
                      aria-label="Augmenter"
                      onClick={() => setCartQuantity(line.productId, line.quantity + 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => removeFromCart(line.productId)}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    aria-label="Retirer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm">{formatFcfa(product!.price * line.quantity)}</p>
            </div>
          ))}
        </div>

        <aside className="h-fit border border-border p-6">
          <h2 className="font-display text-xl tracking-tight">Récapitulatif</h2>
          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Sous-total</dt>
              <dd>{formatFcfa(cartSubtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Livraison</dt>
              <dd className="text-muted-foreground">Calculée à l'étape suivante</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Livraison offerte à partir de {formatFcfa(content.freeShippingFrom)} d'achat.
          </p>
          <Link to="/commande" className="btn-square btn-solid mt-6 w-full">
            Passer la commande
          </Link>
          <Link
            to="/boutique"
            className="mt-3 block px-6 py-2 text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Continuer mes achats
          </Link>
        </aside>
      </div>
    </ShopLayout>
  );
}
