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

/** Méthode de connexion choisie. L'inscription passe toujours par un mot de passe. */
type Methode = "motdepasse" | "lien";

/** Écran intermédiaire affiché après un envoi d'e-mail. */
type Attente = { titre: string; intro: string; adresse: string; relance?: () => void } | null;

/**
 * Bascule entre les méthodes de connexion.
 *
 * Reprend l'aspect des filtres de la boutique : un seul bloc bordé, l'option active en
 * inversé. Sans elle, on demandait un mot de passe à quelqu'un venu justement pour
 * s'en passer.
 */
function ChoixMethode({ valeur, onChange }: { valeur: Methode; onChange: (m: Methode) => void }) {
  const options: { id: Methode; libelle: string }[] = [
    { id: "motdepasse", libelle: "Mot de passe" },
    { id: "lien", libelle: "Lien par e-mail" },
  ];

  return (
    <div className="flex border border-border" role="tablist" aria-label="Méthode de connexion">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={valeur === o.id}
          onClick={() => onChange(o.id)}
          className={`label-mono flex-1 px-4 py-3 transition-colors ${
            valeur === o.id ? "bg-foreground text-background" : "hover:bg-muted"
          }`}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  );
}

function EcranAttente({ attente, retour }: { attente: NonNullable<Attente>; retour: () => void }) {
  const [relance, setRelance] = useState(false);

  return (
    <ShopLayout>
      <PageHeader title={attente.titre} intro={attente.intro} />
      <div className="mx-auto max-w-md px-4 pb-24">
        <div className="border border-border p-6">
          <p className="text-sm leading-relaxed">
            Message envoyé à <span className="font-mono">{attente.adresse}</span>.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Pensez à regarder dans les indésirables si vous ne le voyez pas arriver.
          </p>

          {attente.relance && (
            <button
              type="button"
              disabled={relance}
              onClick={() => {
                attente.relance?.();
                setRelance(true);
                toast.success("Message renvoyé");
              }}
              className="btn-square btn-outline mt-6 w-full disabled:opacity-50"
            >
              {relance ? "Message renvoyé" : "Renvoyer"}
            </button>
          )}

          <button
            type="button"
            onClick={retour}
            className="mt-3 w-full text-center text-sm underline"
          >
            Retour à la connexion
          </button>
        </div>
      </div>
    </ShopLayout>
  );
}

function Compte() {
  const { user, signIn, inscrire, signOut, orders } = useStore();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [methode, setMethode] = useState<Methode>("motdepasse");
  const [enCours, setEnCours] = useState(false);
  const [attente, setAttente] = useState<Attente>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  if (!user) {
    if (attente) {
      return <EcranAttente attente={attente} retour={() => setAttente(null)} />;
    }

    const parLien = mode === "login" && methode === "lien";

    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      const adresse = email.trim().toLowerCase();
      if (!adresse) {
        toast.error("Indiquez votre adresse e-mail.");
        return;
      }

      // Connexion par lien : rien d'autre à saisir. La réponse ne dit jamais si le
      // compte existe — l'inverse permettrait de découvrir qui est client de la boutique.
      if (parLien) {
        setEnCours(true);
        await api.demanderLienMagique(adresse).catch(() => undefined);
        setEnCours(false);
        setAttente({
          titre: "Vérifiez votre boîte",
          intro:
            "Si un compte existe avec cette adresse, un lien de connexion vient d'être envoyé.",
          adresse,
          relance: () => void api.demanderLienMagique(adresse).catch(() => undefined),
        });
        return;
      }

      if (password.length < 8) {
        toast.error("Le mot de passe doit comporter au moins 8 caractères.");
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
          setAttente({
            titre: "Confirmez votre adresse",
            intro: "Votre compte est créé. Il ne reste qu'à valider votre adresse e-mail.",
            adresse,
            relance: () => void api.renvoyerVerification(adresse).catch(() => undefined),
          });
        }
        setPassword("");
        setConfirmation("");
      } catch (erreur) {
        toast.error(erreur instanceof Error ? erreur.message : "Connexion impossible.");
      } finally {
        setEnCours(false);
      }
    };

    const libelleAction = parLien
      ? "Recevoir mon lien"
      : mode === "login"
        ? "Se connecter"
        : "Créer mon compte";

    return (
      <ShopLayout>
        <PageHeader
          title={mode === "login" ? "Connexion" : "Créer un compte"}
          intro="Un compte vous permet d'utiliser les codes promo et de retrouver l'historique de vos commandes."
        />
        <div className="mx-auto max-w-md px-4 pb-24">
          <form onSubmit={(e) => void submit(e)} className="space-y-4 border border-border p-6">
            {mode === "login" && <ChoixMethode valeur={methode} onChange={setMethode} />}

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
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 rounded-none"
              />
            </div>

            {/* Le champ mot de passe disparaît en mode lien : le demander à quelqu'un
                qui vient précisément pour s'en passer n'aurait aucun sens. */}
            {!parLien && (
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
            )}

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
              {enCours ? "Un instant…" : libelleAction}
            </button>

            <p className="text-center text-xs text-muted-foreground">
              {parLien
                ? "Vous recevrez un lien valable quelques minutes, utilisable une seule fois."
                : "Le mot de passe doit comporter au moins 8 caractères."}
            </p>

            {mode === "login" && methode === "motdepasse" && (
              <button
                type="button"
                onClick={() => {
                  const adresse = email.trim().toLowerCase();
                  if (!adresse) {
                    toast.error("Indiquez d'abord votre adresse e-mail.");
                    return;
                  }
                  void api.reinitialiserMotDePasse(adresse).catch(() => undefined);
                  setAttente({
                    titre: "Vérifiez votre boîte",
                    intro:
                      "Si un compte existe avec cette adresse, un lien de réinitialisation vient d'être envoyé.",
                    adresse,
                    relance: () => void api.reinitialiserMotDePasse(adresse).catch(() => undefined),
                  });
                }}
                className="w-full text-center text-sm underline"
              >
                Mot de passe oublié ?
              </button>
            )}

            {/* La connexion Google reviendra une fois les identifiants OAuth fournis.
                Un bouton qui échoue au clic vaut moins qu'un bouton absent. */}
            <p className="border-t border-border pt-4 text-center text-sm text-muted-foreground">
              {mode === "login" ? "Pas encore de compte ?" : "Déjà cliente ?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setMethode("motdepasse");
                }}
                className="underline"
              >
                {mode === "login" ? "Créer un compte" : "Se connecter"}
              </button>
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
              setMethode("motdepasse");
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
