import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ShopLayout, PageHeader } from "@/components/layout/ShopLayout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatFcfa } from "@/lib/format";
import { newId, orderNumber, useStore } from "@/lib/store";
import type { Order } from "@/data/types";

export const Route = createFileRoute("/commande")({
  head: () => ({
    meta: [
      { title: "Commande & livraison | Deco'Rek" },
      {
        name: "description",
        content:
          "Renseignez vos coordonnées de livraison. Commande validée à la soumission, paiement à la réception.",
      },
      { property: "og:title", content: "Finaliser ma commande — Deco'Rek" },
      {
        property: "og:description",
        content: "Livraison à Dakar et en régions, paiement à la livraison.",
      },
    ],
  }),
  component: Commande,
});

function Commande() {
  const { cart, products, cartSubtotal, regions, content, user, validatePromo, placeOrder } =
    useStore();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [regionId, setRegionId] = useState(regions[0]?.id ?? "");
  const [areaId, setAreaId] = useState(regions[0]?.areas[0]?.id ?? "");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [appliedCode, setAppliedCode] = useState<string | undefined>();
  const [promoError, setPromoError] = useState("");

  const region = regions.find((r) => r.id === regionId);
  const area = region?.areas.find((a) => a.id === areaId) ?? region?.areas[0];
  const rawFee = area?.fee ?? 0;
  const fee = cartSubtotal >= content.freeShippingFrom ? 0 : rawFee;
  const total = Math.max(0, cartSubtotal - discount) + fee;

  const lines = cart
    .map((l) => ({ line: l, product: products.find((p) => p.id === l.productId) }))
    .filter((x) => x.product);

  if (lines.length === 0) {
    return (
      <ShopLayout>
        <div className="mx-auto max-w-6xl px-4 py-24 text-center">
          <h1 className="title-lg">Votre panier est vide</h1>
          <Link to="/boutique" className="mt-6 inline-block text-sm underline">
            Retour à la boutique
          </Link>
        </div>
      </ShopLayout>
    );
  }

  const applyPromo = () => {
    setPromoError("");
    if (!user) {
      setPromoError("Les codes promo sont réservés aux clients connectés.");
      return;
    }
    const result = validatePromo(code, cartSubtotal);
    if ("error" in result) {
      setDiscount(0);
      setAppliedCode(undefined);
      setPromoError(result.error);
      return;
    }
    setDiscount(result.discount);
    setAppliedCode(result.promo.code);
    toast.success(`Code ${result.promo.code} appliqué`);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !address.trim() || !region || !area) {
      toast.error("Merci de compléter vos coordonnées de livraison.");
      return;
    }
    const order: Order = {
      id: newId("o"),
      number: orderNumber(),
      createdAt: new Date().toISOString(),
      customer: { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined },
      delivery: {
        regionId: region.id,
        regionName: region.name,
        areaName: area.name,
        address: address.trim(),
        fee,
        note: note.trim() || undefined,
      },
      items: lines.map(({ line, product }) => ({
        productId: product!.id,
        name: product!.name,
        price: product!.price,
        quantity: line.quantity,
        image: product!.images[0] ?? "",
      })),
      subtotal: cartSubtotal,
      discount,
      promoCode: appliedCode,
      total,
      status: "en_attente",
      paid: false,
      userEmail: user?.email,
    };
    placeOrder(order);
    void navigate({ to: "/confirmation/$number", params: { number: order.number } });
  };

  return (
    <ShopLayout>
      <PageHeader
        title="Finaliser la commande"
        intro="Commande validée dès la soumission. Vous payez à la réception, après vérification du colis."
      />
      <form
        onSubmit={submit}
        className="mx-auto grid max-w-6xl gap-10 px-4 pb-20 lg:grid-cols-[1fr_360px]"
      >
        <div className="space-y-10">
          <section>
            <h2 className="font-display text-xl tracking-tight">1. Vos coordonnées</h2>
            {!user && (
              <p className="mt-2 text-sm text-muted-foreground">
                Vous commandez en invité.{" "}
                <Link to="/compte" className="underline">
                  Créez un compte
                </Link>{" "}
                pour utiliser un code promo et suivre vos commandes.
              </p>
            )}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">Nom complet *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 rounded-none"
                />
              </div>
              <div>
                <Label htmlFor="phone">Téléphone *</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="77 000 00 00"
                  className="mt-1.5 rounded-none"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="email">Email (facultatif)</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 rounded-none"
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">2. Livraison</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="region">Région *</Label>
                <select
                  id="region"
                  value={regionId}
                  onChange={(e) => {
                    setRegionId(e.target.value);
                    const r = regions.find((x) => x.id === e.target.value);
                    setAreaId(r?.areas[0]?.id ?? "");
                  }}
                  className="mt-1.5 h-9 w-full border border-input bg-background px-3 text-sm"
                >
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="area">Quartier / zone *</Label>
                <select
                  id="area"
                  value={area?.id ?? ""}
                  onChange={(e) => setAreaId(e.target.value)}
                  className="mt-1.5 h-9 w-full border border-input bg-background px-3 text-sm"
                >
                  {region?.areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {formatFcfa(a.fee)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="address">Adresse précise *</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-1.5 rounded-none"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="note">Indications pour le livreur</Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1.5 rounded-none"
                  rows={3}
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">3. Paiement</h2>
            <div className="mt-5 border border-border p-5">
              <p className="text-sm font-medium">Paiement à la livraison</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Espèces ou transfert mobile, à remettre au livreur à la réception. Aucun paiement en
                ligne n'est demandé.
              </p>
            </div>
          </section>
        </div>

        <aside className="h-fit border border-border p-6">
          <h2 className="font-display text-xl tracking-tight">Récapitulatif</h2>
          <ul className="mt-5 space-y-3 text-sm">
            {lines.map(({ line, product }) => (
              <li key={line.productId} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3">
                  {product!.images[0] ? (
                    <img
                      src={product!.images[0]}
                      alt={product!.name}
                      loading="lazy"
                      className="h-14 w-14 shrink-0 border border-border object-cover"
                    />
                  ) : (
                    <span className="h-14 w-14 shrink-0 border border-border bg-muted" />
                  )}
                  <span className="min-w-0 truncate text-muted-foreground">
                    {product!.name} × {line.quantity}
                  </span>
                </span>
                <span>{formatFcfa(product!.price * line.quantity)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 border-t border-border pt-5">
            <Label htmlFor="promo" className="text-xs tracking-wide uppercase">
              Code promo
            </Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="promo"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="BIENVENUE10"
                className="rounded-none"
                disabled={!user}
              />
              <button
                type="button"
                onClick={applyPromo}
                className="border border-foreground px-4 text-sm transition-colors hover:bg-muted"
              >
                OK
              </button>
            </div>
            {promoError && <p className="mt-2 text-xs text-destructive">{promoError}</p>}
            {!user && (
              <p className="mt-2 text-xs text-muted-foreground">
                Réservé aux comptes clients —{" "}
                <Link to="/compte" className="underline">
                  se connecter
                </Link>
              </p>
            )}
          </div>

          <dl className="mt-5 space-y-2 border-t border-border pt-5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Sous-total</dt>
              <dd>{formatFcfa(cartSubtotal)}</dd>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-orange-brand">
                <dt>Remise {appliedCode}</dt>
                <dd>-{formatFcfa(discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Livraison</dt>
              <dd>{fee === 0 ? "Offerte" : formatFcfa(fee)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-3 text-base">
              <dt>Total à payer</dt>
              <dd>{formatFcfa(total)}</dd>
            </div>
          </dl>

          <button type="submit" className="btn-square btn-solid mt-6 w-full">
            Valider ma commande
          </button>
        </aside>
      </form>
    </ShopLayout>
  );
}
