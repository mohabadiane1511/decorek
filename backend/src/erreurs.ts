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

export function gererErreur(erreur: Error, c: Context): Response {
  if (erreur instanceof ErreurApi) {
    return c.json(corpsErreur(erreur.code, erreur.message, erreur.details), erreur.status);
  }
  if (erreur instanceof HTTPException) {
    return c.json(corpsErreur("ERREUR_INTERNE", erreur.message), erreur.status);
  }

  // Une erreur inattendue ne doit jamais exposer sa trace au client : elle peut contenir
  // une requête SQL, un chemin de fichier ou une valeur de configuration.
  console.error("Erreur non gérée :", erreur);
  return c.json(
    corpsErreur("ERREUR_INTERNE", "Une erreur interne est survenue."),
    500 satisfies ContentfulStatusCode,
  );
}
