import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShopLayout, PageHeader } from "@/components/layout/ShopLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrderTimeline } from "@/components/shop/OrderTimeline";
import { MesAdresses } from "@/components/compte/MesAdresses";
import { MesInformations } from "@/components/compte/MesInformations";
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
  const { user, signIn, inscrire, signOut } = useStore();
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

  return (
    <EspaceClient
      onDeconnexion={() => {
        // Revenir au formulaire de connexion : quelqu'un qui vient de se déconnecter
        // veut se reconnecter, pas créer un second compte.
        setMode("login");
        setMethode("motdepasse");
        void signOut();
      }}
    />
  );
}

/**
 * Ce que voit une cliente connectée.
 *
 * L'historique vient d'une route dédiée. Il était auparavant tiré de la liste du
 * back-office, qui n'est chargée que pour les administratrices : une cliente n'y
 * retrouvait que les commandes passées pendant sa visite en cours, et repartait en
 * croyant les précédentes perdues.
 */
function EspaceClient({ onDeconnexion }: { onDeconnexion: () => void }) {
  const { user, favoris } = useStore();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["mes-commandes"],
    queryFn: ({ signal }) => api.mesCommandes(signal),
  });

  const commandes = data ?? [];
  const enCours = commandes.filter(
    (o) => o.status !== "livree" && o.status !== "annulee" && o.status !== "non_honoree",
  );

  return (
    <ShopLayout>
      <PageHeader
        index="Espace client"
        title={`Bonjour, ${user?.name ?? ""}`}
        intro="Vos commandes, leur suivi et vos pièces mises de côté."
        aside={user?.email}
      />

      <div className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <div className="flex flex-wrap gap-3">
          {user?.isAdmin && (
            <Link to="/admin" className="btn-square btn-solid">
              Back-office
            </Link>
          )}
          <Link to="/boutique" className="btn-square btn-outline border-border">
            Continuer mes achats
          </Link>
          <button
            type="button"
            onClick={onDeconnexion}
            className="btn-square btn-outline border-border"
          >
            Se déconnecter
          </button>
        </div>

        {/* Trois repères, lus d'un coup d'œil : combien de commandes, combien en route,
            combien d'articles mis de côté. */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Repere valeur={isPending ? "…" : String(commandes.length)} libelle="Commandes passées" />
          <Repere
            valeur={isPending ? "…" : String(enCours.length)}
            libelle="En cours de livraison"
          />
          <Repere
            valeur={String(favoris.length)}
            libelle="Pièces en favoris"
            lien={favoris.length > 0 ? "/favoris" : undefined}
          />
        </div>

        <h2 className="section-index mt-16">Mes informations</h2>
        <div className="mt-6">
          <MesInformations />
        </div>

        <h2 className="section-index mt-16">Mes adresses de livraison</h2>
        <div className="mt-6">
          <MesAdresses />
        </div>

        <h2 className="section-index mt-16">Mes commandes</h2>

        {isError ? (
          <div className="mt-6 border border-border p-8 text-center">
            <p className="text-muted-foreground">Impossible de charger vos commandes.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="btn-square btn-outline mt-6 border-border"
            >
              Réessayer
            </button>
          </div>
        ) : isPending ? (
          <div className="mt-6 space-y-4">
            {[0, 1].map((i) => (
              <div key={i} className="h-40 animate-pulse border border-border bg-muted/40" />
            ))}
          </div>
        ) : commandes.length === 0 ? (
          <div className="mt-6 border border-border p-10 text-center">
            <p className="text-lg">Aucune commande pour l'instant.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Vos commandes apparaîtront ici, avec leur suivi.
            </p>
            <Link to="/boutique" className="btn-square btn-solid mt-8">
              Découvrir la boutique
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {commandes.map((o) => (
              <article key={o.id} className="border border-border bg-background">
                <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-6 py-4">
                  <div>
                    <h3 className="font-mono text-sm tracking-wider">{o.number}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(o.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono">{formatFcfa(o.total)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {o.paid ? "Encaissée" : "À régler à la livraison"}
                    </p>
                  </div>
                </div>

                {/* Les articles avec leur vignette : on reconnaît sa commande sans
                    avoir à lire le détail ligne à ligne. */}
                <ul className="flex flex-wrap gap-4 px-6 py-5">
                  {o.items.map((i) => (
                    <li key={`${o.id}-${i.productId}`} className="flex items-center gap-3">
                      {i.image ? (
                        <img
                          src={i.image}
                          alt=""
                          loading="lazy"
                          className="h-14 w-14 shrink-0 bg-sand object-cover"
                        />
                      ) : (
                        <span className="h-14 w-14 shrink-0 bg-sand" />
                      )}
                      <span className="text-sm">
                        <span className="block max-w-[16rem] truncate">{i.name}</span>
                        <span className="text-muted-foreground">
                          {i.quantity} × {formatFcfa(i.price)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="border-t border-border px-6 py-5">
                  <p className="label-mono mb-4 text-muted-foreground">{statusLabels[o.status]}</p>
                  <OrderTimeline status={o.status} />
                  <p className="mt-5 text-xs text-muted-foreground">
                    Livraison à {o.delivery.areaName}, {o.delivery.regionName}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </ShopLayout>
  );
}

/** Chiffre-clé de l'espace client, cliquable quand il mène quelque part. */
function Repere({
  valeur,
  libelle,
  lien,
}: {
  valeur: string;
  libelle: string;
  lien?: string | undefined;
}) {
  const contenu = (
    <>
      <p className="title-lg">{valeur}</p>
      <p className="label-mono mt-1 text-muted-foreground">{libelle}</p>
    </>
  );
  if (lien === "/favoris") {
    return (
      <Link to="/favoris" className="border border-border p-6 transition-colors hover:bg-muted">
        {contenu}
      </Link>
    );
  }
  return <div className="border border-border p-6">{contenu}</div>;
}
