import { Redis } from "ioredis";

/**
 * Cache de lecture adossé à Redis.
 *
 * Règle qui gouverne tout ce fichier : **le cache est facultatif**. Toute panne de Redis
 * est rattrapée et l'appelant reçoit quand même sa donnée, chargée depuis la base. Un
 * cache qui fait tomber le site coûte plus cher que l'absence de cache.
 *
 * L'invalidation passe par un compteur de version intégré aux clés. Modifier un produit
 * incrémente ce compteur, ce qui périme d'un coup toutes les entrées dérivées. Traquer
 * les clés une par une paraît plus propre, mais finit toujours par en oublier une — un
 * filtre rare, une combinaison de tri — et le défaut se manifeste par un prix périmé
 * affiché à un client.
 */
export type Cache = {
  lireOuCharger: <T>(cle: string, ttlSecondes: number, charger: () => Promise<T>) => Promise<T>;
  invaliderCatalogue: () => Promise<void>;
  versionCatalogue: () => Promise<number>;
  disponible: () => boolean;
  fermer: () => Promise<void>;
};

const CLE_VERSION = "catalogue:version";

export function creerCache(url: string): Cache {
  const redis = new Redis(url, {
    // Sans plafond, chaque commande attendrait indéfiniment une reconnexion et l'API
    // se figerait au lieu de se rabattre sur la base.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
    retryStrategy: (tentatives) => Math.min(tentatives * 200, 5_000),
  });

  let enPanne = false;
  redis.on("error", (erreur: Error) => {
    if (!enPanne) {
      enPanne = true;
      console.warn(`Cache indisponible, lecture directe en base : ${erreur.message}`);
    }
  });
  redis.on("ready", () => {
    if (enPanne) console.info("Cache de nouveau disponible.");
    enPanne = false;
  });

  async function versionCatalogue(): Promise<number> {
    try {
      const brut = await redis.get(CLE_VERSION);
      // Zéro et non un : INCR sur une clé absente renvoie 1, et une valeur par défaut
      // à 1 rendrait la toute première invalidation sans effet.
      return brut ? Number(brut) : 0;
    } catch {
      return 0;
    }
  }

  return {
    versionCatalogue,
    disponible: () => redis.status === "ready",

    async lireOuCharger(cle, ttlSecondes, charger) {
      let cleVersionnee: string | undefined;
      try {
        cleVersionnee = `v${await versionCatalogue()}:${cle}`;
        const enCache = await redis.get(cleVersionnee);
        if (enCache !== null) return JSON.parse(enCache);
      } catch {
        // Lecture impossible : on continue, la base reste la source de vérité.
        return charger();
      }

      const valeur = await charger();
      try {
        // Un TTL est posé sur chaque entrée même si l'invalidation par version suffit
        // en théorie : si une invalidation est un jour oubliée, l'écart se résorbe seul.
        await redis.set(cleVersionnee, JSON.stringify(valeur), "EX", ttlSecondes);
      } catch {
        // L'écriture en cache est une optimisation : son échec ne regarde pas l'appelant.
      }
      return valeur;
    },

    async invaliderCatalogue() {
      try {
        await redis.incr(CLE_VERSION);
      } catch (erreur) {
        // Ici, en revanche, l'échec compte : sans incrément, des données périmées
        // resteraient servies jusqu'à l'expiration du TTL.
        console.error("Invalidation du cache impossible", erreur);
      }
    },

    async fermer() {
      await redis.quit().catch(() => redis.disconnect());
    },
  };
}
