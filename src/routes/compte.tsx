import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ShopLayout, PageHeader } from "@/components/layout/ShopLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrderTimeline } from "@/components/shop/OrderTimeline";
import { formatDate, formatFcfa } from "@/lib/format";
import { statusLabels, useStore } from "@/lib/store";

export const Route = createFileRoute("/compte")({
  head: () => ({
    meta: [
      { title: "Mon espace client | Deco'Rek" },
      {
        name: "description",
        content:
          "Connectez-vous pour suivre vos commandes Deco'Rek et bénéficier des codes promo réservés aux clients.",
      },
      { property: "og:title", content: "Espace client — Deco'Rek" },
      { property: "og:description", content: "Historique et suivi de vos commandes." },
    ],
  }),
  component: Compte,
});

function Compte() {
  const { user, signIn, signOut, orders } = useStore();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!user) {
    const submit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim() || password.length < 4) {
        toast.error("Email et mot de passe (4 caractères minimum) requis.");
        return;
      }
      signIn({
        name: name.trim() || email.split("@")[0]!,
        email: email.trim().toLowerCase(),
        isAdmin: email.trim().toLowerCase().startsWith("admin"),
      });
      toast.success(mode === "login" ? "Bienvenue !" : "Compte créé");
    };

    return (
      <ShopLayout>
        <PageHeader
          title={mode === "login" ? "Connexion" : "Créer un compte"}
          intro="Un compte vous permet d'utiliser les codes promo et de retrouver l'historique de vos commandes."
        />
        <div className="mx-auto max-w-md px-4 pb-24">
          <form onSubmit={submit} className="space-y-4 border border-border p-6">
            {mode === "signup" && (
              <div>
                <Label htmlFor="n">Nom complet</Label>
                <Input
                  id="n"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 rounded-none"
                />
              </div>
            )}
            <div>
              <Label htmlFor="e">Email</Label>
              <Input
                id="e"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 rounded-none"
              />
            </div>
            <div>
              <Label htmlFor="p">Mot de passe</Label>
              <Input
                id="p"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 rounded-none"
              />
            </div>
            <button type="submit" className="btn-square btn-solid w-full">
              {mode === "login" ? "Se connecter" : "Créer mon compte"}
            </button>
            <button
              type="button"
              onClick={() =>
                signIn({ name: "Client Google", email: "client.google@example.sn", isAdmin: false })
              }
              className="w-full border border-border px-6 py-3 text-sm transition-colors hover:bg-muted"
            >
              Continuer avec Google
            </button>
            <p className="pt-2 text-center text-sm text-muted-foreground">
              {mode === "login" ? "Pas encore de compte ?" : "Déjà cliente ?"}{" "}
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
                className="underline"
              >
                {mode === "login" ? "Créer un compte" : "Se connecter"}
              </button>
            </p>
            <p className="text-center text-xs text-muted-foreground">
              Démo : utilisez un email commençant par « admin » pour accéder au back-office.
            </p>
          </form>
        </div>
      </ShopLayout>
    );
  }

  const myOrders = orders.filter(
    (o) => o.userEmail === user.email || o.customer.email === user.email,
  );

  return (
    <ShopLayout>
      <PageHeader title={`Bonjour, ${user.name}`} intro="Vos commandes et leur suivi." />
      <div className="mx-auto max-w-4xl px-4 pb-24">
        <div className="flex flex-wrap gap-3">
          {user.isAdmin && (
            <Link
              to="/admin"
              className="border border-border px-5 py-2.5 text-sm transition-colors hover:bg-muted"
            >
              Back-office
            </Link>
          )}
          <button
            onClick={() => signOut()}
            className="border border-border px-5 py-2.5 text-sm transition-colors hover:bg-muted"
          >
            Se déconnecter
          </button>
        </div>

        {myOrders.length === 0 ? (
          <p className="mt-12 text-sm text-muted-foreground">
            Aucune commande pour l'instant.{" "}
            <Link to="/boutique" className="underline">
              Découvrir la boutique
            </Link>
          </p>
        ) : (
          <div className="mt-10 space-y-6">
            {myOrders.map((o) => (
              <article key={o.id} className="border border-border p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-mono text-sm tracking-wider">{o.number}</h2>
                  <span className="text-sm text-muted-foreground">{formatDate(o.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm">
                  {statusLabels[o.status]} — {formatFcfa(o.total)}{" "}
                  {o.paid ? "(encaissée)" : "(à payer à la livraison)"}
                </p>
                <div className="mt-5">
                  <OrderTimeline status={o.status} />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </ShopLayout>
  );
}
