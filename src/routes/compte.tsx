import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ShopLayout, PageHeader } from "@/components/layout/ShopLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrderTimeline } from "@/components/shop/OrderTimeline";
import { formatDate, formatFcfa } from "@/lib/format";
import { api } from "@/lib/api";
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
  const { user, signIn, inscrire, signOut, orders } = useStore();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [enCours, setEnCours] = useState(false);
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  const [lienEnvoye, setLienEnvoye] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  if (!user) {
    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      const adresse = email.trim().toLowerCase();
      // Le serveur impose 8 caractères : autant le dire ici plutôt que de laisser
      // partir une requête vouée à l'échec.
      if (!adresse || password.length < 8) {
        toast.error("Adresse e-mail et mot de passe d'au moins 8 caractères requis.");
        return;
      }
      // Une faute de frappe à l'inscription enfermerait le client dehors : il ne
      // pourrait plus se connecter avec le mot de passe qu'il croit avoir choisi.
      if (mode === "signup" && password !== confirmation) {
        toast.error("Les deux mots de passe ne correspondent pas.");
        return;
      }

      setEnCours(true);
      try {
        if (mode === "login") {
          await signIn(adresse, password);
          toast.success("Bienvenue !");
        } else {
          await inscrire(name.trim() || adresse.split("@")[0]!, adresse, password);
          // La session ne s'ouvre qu'une fois l'adresse confirmée : on l'annonce
          // clairement, sinon le client croirait son inscription en échec.
          setAConfirmer(adresse);
        }
        setPassword("");
        setConfirmation("");
      } catch (erreur) {
        toast.error(erreur instanceof Error ? erreur.message : "Connexion impossible.");
      } finally {
        setEnCours(false);
      }
    };

    if (aConfirmer) {
      return (
        <ShopLayout>
          <PageHeader
            title="Confirmez votre adresse"
            intro="Votre compte est créé. Il ne reste qu'à valider votre adresse e-mail."
          />
          <div className="mx-auto max-w-md px-4 pb-24">
            <div className="border border-border p-6">
              <p className="text-sm leading-relaxed">
                Nous avons envoyé un lien à <span className="font-mono">{aConfirmer}</span>.
                Ouvrez-le pour activer votre compte — il est valable 24 heures.
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                Pensez à regarder dans les indésirables si vous ne le voyez pas.
              </p>
              <button
                type="button"
                disabled={lienEnvoye}
                onClick={() => {
                  void api.renvoyerVerification(aConfirmer).catch(() => undefined);
                  setLienEnvoye(true);
                  toast.success("Lien renvoyé");
                }}
                className="btn-square btn-outline mt-6 w-full disabled:opacity-50"
              >
                {lienEnvoye ? "Lien renvoyé" : "Renvoyer le lien"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAConfirmer(null);
                  setMode("login");
                }}
                className="mt-3 w-full text-center text-sm underline"
              >
                Retour à la connexion
              </button>
            </div>
          </div>
        </ShopLayout>
      );
    }

    return (
      <ShopLayout>
        <PageHeader
          title={mode === "login" ? "Connexion" : "Créer un compte"}
          intro="Un compte vous permet d'utiliser les codes promo et de retrouver l'historique de vos commandes."
        />
        <div className="mx-auto max-w-md px-4 pb-24">
          <form onSubmit={(e) => void submit(e)} className="space-y-4 border border-border p-6">
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
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 rounded-none"
              />
            </div>
            {mode === "signup" && (
              <div>
                <Label htmlFor="p2">Confirmer le mot de passe</Label>
                <Input
                  id="p2"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  className="mt-1.5 rounded-none"
                />
                {confirmation.length > 0 && confirmation !== password && (
                  <p className="mt-1.5 text-xs text-destructive">
                    Les deux mots de passe ne correspondent pas.
                  </p>
                )}
              </div>
            )}
            <button
              type="submit"
              disabled={enCours}
              className="btn-square btn-solid w-full disabled:opacity-50"
            >
              {enCours ? "Un instant…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
            </button>
            {mode === "login" && (
              <button
                type="button"
                onClick={() => {
                  const adresse = email.trim().toLowerCase();
                  if (!adresse) {
                    toast.error("Indiquez d'abord votre adresse e-mail.");
                    return;
                  }
                  // Réponse volontairement identique que le compte existe ou non :
                  // dire « adresse inconnue » révélerait qui est client de la boutique.
                  void api.demanderLienMagique(adresse).catch(() => undefined);
                  toast.success("Si un compte existe, un lien vient d'être envoyé.");
                }}
                className="w-full border border-border px-6 py-3 text-sm transition-colors hover:bg-muted"
              >
                Recevoir un lien de connexion
              </button>
            )}
            {/* La connexion Google reviendra une fois les identifiants OAuth fournis.
                Un bouton qui échoue au clic vaut moins qu'un bouton absent. */}
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
              Le mot de passe doit comporter au moins 8 caractères.
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
            onClick={() => {
              // Revenir au formulaire de connexion : quelqu'un qui vient de se
              // déconnecter veut se reconnecter, pas créer un second compte.
              setMode("login");
              void signOut();
            }}
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
