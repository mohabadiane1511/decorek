import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Toute erreur renvoyée par l'API prend cette forme, sans exception. Un client qui sait
 * lire une erreur sait les lire toutes.
 *
 * Les clés sont en anglais pour rester cohérentes avec `src/data/types.ts`, que le front
 * consomme déjà ; les messages sont en français car ils peuvent être montrés au client.
 */
export type ReponseErreur = {
  error: {
    code: CodeErreur;
    message: string;
    details?: unknown;
  };
};

export type CodeErreur =
  | "VALIDATION"
  | "INTROUVABLE"
  | "NON_AUTHENTIFIE"
  | "INTERDIT"
  | "CONFLIT"
  | "TROP_DE_REQUETES"
  | "ERREUR_INTERNE";

const STATUTS: Record<CodeErreur, ContentfulStatusCode> = {
  VALIDATION: 400,
  NON_AUTHENTIFIE: 401,
  INTERDIT: 403,
  INTROUVABLE: 404,
  CONFLIT: 409,
  TROP_DE_REQUETES: 429,
  ERREUR_INTERNE: 500,
};

export class ErreurApi extends HTTPException {
  readonly code: CodeErreur;
  readonly details: unknown;

  constructor(code: CodeErreur, message: string, details?: unknown) {
    super(STATUTS[code], { message });
    this.code = code;
    this.details = details;
  }
}

export function corpsErreur(code: CodeErreur, message: string, details?: unknown): ReponseErreur {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

/**
 * Les champs mis en cause par une violation d'unicité, s'il y en a.
 *
 * L'erreur est reconnue à sa forme plutôt qu'à son type : importer la classe de
 * Prisma ici lierait la gestion des erreurs HTTP au client de base de données, alors
 * qu'elle sert aussi à des erreurs qui n'en viennent pas.
 *
 * Le pilote range l'information à plusieurs endroits selon les versions — `meta.target`
 * historiquement, la contrainte de l'adaptateur depuis Prisma 7 — et il arrive que
 * seul le nom de l'index (« products_sku_key ») subsiste. Les trois sources sont donc
 * réunies, quitte à ce que l'une soit vide.
 */
function champsEnDoublon(erreur: unknown): string[] | null {
  const candidat = erreur as {
    code?: unknown;
    meta?: {
      target?: unknown;
      driverAdapterError?: { cause?: { constraint?: { fields?: unknown; index?: unknown } } };
    };
  };
  if (candidat.code !== "P2002") return null;

  const indices: string[] = [];
  const ajouter = (valeur: unknown): void => {
    if (typeof valeur === "string") indices.push(valeur);
    else if (Array.isArray(valeur)) {
      for (const v of valeur) if (typeof v === "string") indices.push(v);
    }
  };

  ajouter(candidat.meta?.target);
  const contrainte = candidat.meta?.driverAdapterError?.cause?.constraint;
  ajouter(contrainte?.fields);
  ajouter(contrainte?.index);
  return indices;
}

export function gererErreur(erreur: Error, c: Context): Response {
  if (erreur instanceof ErreurApi) {
    return c.json(corpsErreur(erreur.code, erreur.message, erreur.details), erreur.status);
  }
  if (erreur instanceof HTTPException) {
    return c.json(corpsErreur("ERREUR_INTERNE", erreur.message), erreur.status);
  }

  // Doublon détecté par la base. Sans ce cas, saisir une référence déjà prise
  // renverrait « une erreur interne est survenue » : la cliente ne saurait ni ce qui
  // ne va pas, ni que la correction lui appartient.
  const champs = champsEnDoublon(erreur);
  if (champs) {
    const libelles: Record<string, string> = {
      sku: "Cette référence est déjà utilisée par un autre article.",
      slug: "Cette adresse est déjà prise.",
      code: "Ce code promo existe déjà.",
      email: "Un compte existe déjà avec cette adresse.",
    };
    // Selon le pilote, la base nomme le champ (« sku ») ou son index
    // (« products_sku_key ») : on cherche donc le champ dans ce qu'elle renvoie.
    const indices = champs.join(" ").toLowerCase();
    const message = Object.entries(libelles).find(([champ]) =>
      new RegExp(`\\b${champ}\\b|_${champ}_`).test(indices),
    )?.[1];
    return c.json(
      corpsErreur("CONFLIT", message ?? "Cette valeur est déjà utilisée."),
      409 satisfies ContentfulStatusCode,
    );
  }

  // Une erreur inattendue ne doit jamais exposer sa trace au client : elle peut contenir
  // une requête SQL, un chemin de fichier ou une valeur de configuration.
  console.error("Erreur non gérée :", erreur);
  return c.json(
    corpsErreur("ERREUR_INTERNE", "Une erreur interne est survenue."),
    500 satisfies ContentfulStatusCode,
  );
}
