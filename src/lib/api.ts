import type { Category, DeliveryRegion, Product, SiteContent } from "@/data/types";

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
};
