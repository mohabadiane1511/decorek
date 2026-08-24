import type {
  Category,
  DeliveryRegion,
  Order,
  Product,
  PromoCode,
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
    let details: { error?: { message?: string; code?: string }; message?: string; code?: string } =
      {};
    try {
      details = (await reponse.json()) as typeof details;
    } catch {
      /* réponse non JSON */
    }
    // Better Auth répond avec { message }, notre API avec { error: { message } } :
    // le front ne doit pas avoir à connaître cette différence. Ses messages sont en
    // anglais : ceux qui arrivent sous les yeux d'un client sont traduits.
    const traductions: Record<string, string> = {
      EMAIL_NOT_VERIFIED:
        "Votre adresse n'est pas encore confirmée. Ouvrez le lien reçu par e-mail, ou demandez-en un nouveau.",
      INVALID_EMAIL_OR_PASSWORD: "Adresse e-mail ou mot de passe incorrect.",
      USER_ALREADY_EXISTS: "Un compte existe déjà avec cette adresse.",
      PASSWORD_TOO_SHORT: "Le mot de passe doit comporter au moins 8 caractères.",
    };
    const codeAuth = (details as { code?: string }).code;
    const message =
      (codeAuth ? traductions[codeAuth] : undefined) ??
      details.error?.message ??
      details.message ??
      (reponse.status === 429
        ? "Trop de tentatives. Patientez un instant avant de réessayer."
        : "Identifiants incorrects.");
    throw new ErreurApi(message, reponse.status, details.error?.code);
  }

  return (await reponse.json()) as T;
}

/** Comme `envoyer`, pour les méthodes autres que POST. */
async function envoyerMethode<T>(methode: string, chemin: string, corps?: unknown): Promise<T> {
  const options: RequestInit = {
    method: methode,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
  };
  if (corps !== undefined) options.body = JSON.stringify(corps);

  let reponse: Response;
  try {
    reponse = await fetch(chemin, options);
  } catch {
    throw new ErreurApi("Impossible de joindre la boutique. Vérifiez votre connexion.", 0);
  }
  if (!reponse.ok) {
    let details: CorpsErreur = {};
    try {
      details = (await reponse.json()) as CorpsErreur;
    } catch {
      /* réponse non JSON */
    }
    throw new ErreurApi(
      details.error?.message ?? "L'enregistrement a échoué.",
      reponse.status,
      details.error?.code,
    );
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

/** Ce que le back-office envoie pour créer ou modifier un produit. */
export type EntreeProduit = {
  name: string;
  categoryId: string;
  price: number;
  oldPrice?: number | null;
  stock: number;
  lowStockThreshold: number;
  description: string;
  featured: boolean;
  images: string[];
};

export type EntreePromo = {
  code: string;
  type: "percent" | "amount";
  value: number;
  minAmount: number;
  startsAt: string;
  endsAt: string;
  maxUses: number;
  active: boolean;
};

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

  /** Renvoie le lien de confirmation d'adresse. */
  renvoyerVerification: (email: string) =>
    envoyer<unknown>("/api/auth/send-verification-email", {
      email,
      callbackURL: "/compte",
    }),

  // ---------------------------------------------------------- Administration

  /** Commandes du back-office, filtrables par statut. */
  commandesAdmin: (statut?: string, signal?: AbortSignal) =>
    appeler<{ items: Order[] }>(
      `/api/admin/commandes${statut ? `?statut=${encodeURIComponent(statut)}` : ""}`,
      signal,
    ).then((r) => r.items),

  majCommande: (
    id: string,
    patch: { status?: string; paid?: boolean; internalNote?: string | null },
  ) => envoyerMethode<Order>("PATCH", `/api/admin/commandes/${id}`, patch),

  creerProduit: (produit: EntreeProduit) => envoyer<Product>("/api/admin/produits", produit),
  majProduit: (id: string, produit: EntreeProduit) =>
    envoyerMethode<Product>("PUT", `/api/admin/produits/${id}`, produit),
  supprimerProduit: (id: string) => envoyerMethode<unknown>("DELETE", `/api/admin/produits/${id}`),

  creerCategorie: (c: { name: string; description: string }) =>
    envoyer<Category>("/api/admin/categories", c),
  majCategorie: (id: string, c: { name: string; description: string }) =>
    envoyerMethode<Category>("PUT", `/api/admin/categories/${id}`, c),
  supprimerCategorie: (id: string) =>
    envoyerMethode<unknown>("DELETE", `/api/admin/categories/${id}`),

  promosAdmin: (signal?: AbortSignal) =>
    appeler<{ items: PromoCode[] }>("/api/admin/promos", signal).then((r) => r.items),
  creerPromo: (p: EntreePromo) => envoyer<PromoCode>("/api/admin/promos", p),
  majPromo: (id: string, p: EntreePromo) =>
    envoyerMethode<PromoCode>("PUT", `/api/admin/promos/${id}`, p),
  supprimerPromo: (id: string) => envoyerMethode<unknown>("DELETE", `/api/admin/promos/${id}`),

  majLivraison: (regions: DeliveryRegion[]) =>
    envoyerMethode<{ items: DeliveryRegion[] }>("PUT", "/api/admin/livraison", { regions }).then(
      (r) => r.items,
    ),

  majContenu: (contenu: SiteContent) =>
    envoyerMethode<SiteContent>("PUT", "/api/admin/contenu", contenu),

  /**
   * Demande l'autorisation d'envoyer une image, puis la téléverse directement au
   * stockage. Le fichier ne passe pas par l'API : une photo de plusieurs mégaoctets
   * n'a rien à faire dans sa mémoire.
   */
  televerserImage: async (fichier: File): Promise<string> => {
    const { url, chemin } = await envoyer<{ url: string; chemin: string }>(
      "/api/admin/images/televersement",
      { contentType: fichier.type, taille: fichier.size },
    );

    const envoi = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": fichier.type },
      body: fichier,
    });
    if (!envoi.ok) throw new ErreurApi("Le téléversement de l'image a échoué.", envoi.status);

    return chemin;
  },

  /**
   * Recherche une commande. Le téléphone est exigé pour un visiteur non connecté :
   * les numéros se suivent, et sans cette seconde information n'importe qui pourrait
   * consulter les coordonnées d'autres clients.
   */
  suivreCommande: (numero: string, telephone?: string) =>
    envoyer<Order>("/api/commandes/suivi", { numero, telephone }),

  /** Demande un lien de réinitialisation du mot de passe. */
  reinitialiserMotDePasse: (email: string) =>
    envoyer<unknown>("/api/auth/request-password-reset", {
      email,
      redirectTo: "/compte",
    }),

  /** Demande un lien de connexion à usage unique. */
  demanderLienMagique: (email: string) =>
    envoyer<unknown>("/api/auth/sign-in/magic-link", { email, callbackURL: "/compte" }),

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
