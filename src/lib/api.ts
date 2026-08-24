import type {
  Category,
  DeliveryRegion,
  Order,
  Product,
  SessionUser,
  SiteContent,
} from "@/data/types";

/**
 * Client de l'API.
 *
 * Les URLs sont relatives à dessein : en développement le serveur Vite redirige /api,
 * en production c'est le proxy. Le front n'a donc aucune adresse à connaître, et le
 * même code fonctionne dans les deux cas.
 */

export class ErreurApi extends Error {
  constructor(
    message: string,
    readonly statut: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ErreurApi";
  }
}

type CorpsErreur = { error?: { code?: string; message?: string } };

async function envoyer<T>(chemin: string, corps: unknown): Promise<T> {
  let reponse: Response;
  try {
    reponse = await fetch(chemin, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(corps),
      // Indispensable pour que le cookie de session soit émis et renvoyé.
      credentials: "same-origin",
    });
  } catch {
    throw new ErreurApi("Impossible de joindre la boutique. Vérifiez votre connexion.", 0);
  }

  if (!reponse.ok) {
    let details: { error?: { message?: string; code?: string }; message?: string } = {};
    try {
      details = (await reponse.json()) as typeof details;
    } catch {
      /* réponse non JSON */
    }
    // Better Auth répond avec { message }, notre API avec { error: { message } } :
    // le front ne doit pas avoir à connaître cette différence.
    const message =
      details.error?.message ??
      details.message ??
      (reponse.status === 429
        ? "Trop de tentatives. Patientez un instant avant de réessayer."
        : "Identifiants incorrects.");
    throw new ErreurApi(message, reponse.status, details.error?.code);
  }

  return (await reponse.json()) as T;
}

async function appeler<T>(chemin: string, signal?: AbortSignal): Promise<T> {
  // `exactOptionalPropertyTypes` interdit de passer `signal: undefined` : on ne pose la
  // propriété que si un signal est réellement fourni.
  const options: RequestInit = { headers: { Accept: "application/json" } };
  if (signal) options.signal = signal;

  let reponse: Response;
  try {
    reponse = await fetch(chemin, options);
  } catch {
    // Coupure réseau ou API éteinte : on veut un message lisible, pas un « fetch failed »
    // brut affiché à un client à Dakar.
    throw new ErreurApi("Impossible de joindre la boutique. Vérifiez votre connexion.", 0);
  }

  if (!reponse.ok) {
    let corps: CorpsErreur = {};
    try {
      corps = (await reponse.json()) as CorpsErreur;
    } catch {
      /* la réponse n'était pas du JSON : on garde le message par défaut */
    }
    throw new ErreurApi(
      corps.error?.message ?? "Une erreur est survenue.",
      reponse.status,
      corps.error?.code,
    );
  }

  return (await reponse.json()) as T;
}

export type FiltresProduits = {
  categorie?: string | undefined;
  q?: string | undefined;
  prixMax?: number | undefined;
  tri?: "recent" | "prix-asc" | "prix-desc" | undefined;
  page?: number | undefined;
  parPage?: number | undefined;
};

export type LigneDemandee = { productId: string; quantity: number };

export type DemandeCommande = {
  customer: { name: string; phone: string; email?: string | undefined };
  delivery: { areaId: string; address: string; note?: string | undefined };
  items: LigneDemandee[];
  promoCode?: string | undefined;
};

export type PageProduits = {
  items: Product[];
  total: number;
  page: number;
  pages: number;
};

export function construireRequete(filtres: FiltresProduits): string {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur !== undefined && valeur !== "") params.set(cle, String(valeur));
  }
  const requete = params.toString();
  return requete ? `?${requete}` : "";
}

export const api = {
  produits: (filtres: FiltresProduits = {}, signal?: AbortSignal) =>
    appeler<PageProduits>(`/api/produits${construireRequete(filtres)}`, signal),

  produit: (slug: string, signal?: AbortSignal) =>
    appeler<Product>(`/api/produits/${encodeURIComponent(slug)}`, signal),

  categories: (signal?: AbortSignal) =>
    appeler<{ items: Category[] }>("/api/categories", signal).then((r) => r.items),

  contenu: (signal?: AbortSignal) => appeler<SiteContent>("/api/contenu", signal),

  livraison: (signal?: AbortSignal) =>
    appeler<{ items: DeliveryRegion[] }>("/api/livraison", signal).then((r) => r.items),

  /** Session courante. Renvoie `null` si personne n'est connecté. */
  moi: (signal?: AbortSignal) =>
    appeler<{ utilisateur: SessionUser | null }>("/api/moi", signal).then((r) => r.utilisateur),

  inscrire: (nom: string, email: string, motDePasse: string) =>
    envoyer<unknown>("/api/auth/sign-up/email", { name: nom, email, password: motDePasse }),

  connecter: (email: string, motDePasse: string) =>
    envoyer<unknown>("/api/auth/sign-in/email", { email, password: motDePasse }),

  deconnecter: () => envoyer<unknown>("/api/auth/sign-out", {}),

  /**
   * Envoie la commande. Le corps ne contient aucun montant : les prix, les frais et le
   * total sont calculés par le serveur à partir de la base.
   */
  creerCommande: (demande: DemandeCommande) => envoyer<Order>("/api/commandes", demande),

  verifierPromo: (code: string, items: LigneDemandee[]) =>
    envoyer<{ code: string; discount: number; subtotal: number }>("/api/promos/verifier", {
      code,
      items,
    }),
};
