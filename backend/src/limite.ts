import type { MiddlewareHandler } from "hono";
import type { Redis } from "ioredis";
import { ErreurApi } from "./erreurs.js";

export type Verdict = { autorise: boolean; restant: number };

/**
 * Fenêtre glissante par ensemble ordonné : chaque tentative est horodatée, les entrées
 * sorties de la fenêtre sont supprimées, puis on compte ce qui reste.
 *
 * Une fenêtre fixe (INCR + EXPIRE) serait plus courte à écrire, mais laisse passer deux
 * fois la limite à cheval sur deux fenêtres — précisément ce qu'exploite quelqu'un qui
 * essaie des mots de passe.
 */
export async function verifierLimite(
  redis: Redis,
  cle: string,
  max: number,
  fenetreSecondes: number,
  maintenant = Date.now(),
): Promise<Verdict> {
  const debut = maintenant - fenetreSecondes * 1000;
  const cleComplete = `limite:${cle}`;

  try {
    const resultats = await redis
      .multi()
      .zremrangebyscore(cleComplete, 0, debut)
      .zadd(cleComplete, maintenant, `${maintenant}-${Math.random()}`)
      .zcard(cleComplete)
      .expire(cleComplete, fenetreSecondes)
      .exec();

    const compte = Number(resultats?.[2]?.[1] ?? 0);
    return { autorise: compte <= max, restant: Math.max(0, max - compte) };
  } catch {
    // Redis injoignable : on laisse passer. Bloquer tout le trafic parce que le cache
    // est tombé transformerait une panne mineure en interruption de service. Le risque
    // inverse — quelques minutes sans limitation — est le moindre des deux maux.
    console.warn(`Limitation de débit inopérante (cache injoignable) pour ${cle}`);
    return { autorise: true, restant: max };
  }
}

export type OptionsLimite = {
  max: number;
  fenetreSecondes: number;
  /** Identifie l'appelant. Par défaut l'adresse IP ; peut inclure l'utilisateur connecté. */
  cle?: (contexteIp: string) => string;
};

export function limiter(redis: Redis, nom: string, options: OptionsLimite): MiddlewareHandler {
  return async (c, next) => {
    // Derrière le proxy, l'adresse réelle arrive dans X-Forwarded-For. S'y fier n'est
    // sûr que parce que l'API ne publie aucun port : elle n'est joignable que par le
    // proxy, qui réécrit cet en-tête. Exposer l'API directement rendrait la limitation
    // contournable en envoyant soi-même l'en-tête.
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "inconnu";
    const identifiant = options.cle ? options.cle(ip) : ip;

    const verdict = await verifierLimite(
      redis,
      `${nom}:${identifiant}`,
      options.max,
      options.fenetreSecondes,
    );

    c.header("X-RateLimit-Limit", String(options.max));
    c.header("X-RateLimit-Remaining", String(verdict.restant));

    if (!verdict.autorise) {
      throw new ErreurApi("TROP_DE_REQUETES", "Trop de tentatives. Réessayez dans un instant.");
    }
    await next();
  };
}
