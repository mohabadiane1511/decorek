import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Address } from "../../../src/data/types.js";
import type { Auth } from "../auth.js";
import { exigerConnexion, type Session } from "../auth-middleware.js";
import { corpsErreur, ErreurApi } from "../erreurs.js";
import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * Ce que la cliente gère elle-même : son identité et son carnet d'adresses.
 *
 * Tout est ici cadenassé à la session : une adresse ne se lit, ne se modifie et ne se
 * supprime qu'en étant la sienne. L'identifiant venant de l'URL, s'en remettre à lui
 * seul laisserait consulter le carnet de n'importe qui en changeant un caractère.
 */

const schemaProfil = z.object({
  name: z.string().trim().min(2).max(120),
  // Vidé, le téléphone est effacé : c'est un renseignement de confort, pas une
  // obligation. Il n'est pas validé au format sénégalais, les clientes de la diaspora
  // laissant parfois un numéro étranger.
  phone: z.string().trim().max(30).optional(),
});

const schemaAdresse = z.object({
  label: z.string().trim().min(1).max(60),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(30),
  areaId: z.string().min(1),
  address: z.string().trim().min(5).max(300),
  note: z.string().trim().max(500).optional(),
  isDefault: z.boolean().optional(),
});

function validation<T extends z.ZodTypeAny>(schema: T) {
  return zValidator("json", schema, (resultat, c) => {
    if (!resultat.success) {
      return c.json(corpsErreur("VALIDATION", "Données invalides.", resultat.error.issues), 400);
    }
    return undefined;
  });
}

/** Adresse telle qu'elle sort de la base, sa zone jointe si elle existe encore. */
type AdresseEnBase = {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  areaId: string | null;
  address: string;
  note: string | null;
  isDefault: boolean;
  area: { id: string; name: string; fee: number; region: { id: string; name: string } } | null;
};

export function versAdresse(a: AdresseEnBase): Address {
  return {
    id: a.id,
    label: a.label,
    fullName: a.fullName,
    phone: a.phone,
    // La zone retirée du catalogue laisse l'adresse lisible mais sans tarif : mieux
    // vaut demander de la revoir qu'annoncer des frais qui n'existent plus.
    areaId: a.area?.id,
    areaName: a.area?.name,
    regionId: a.area?.region.id,
    regionName: a.area?.region.name,
    fee: a.area?.fee,
    address: a.address,
    note: a.note ?? undefined,
    isDefault: a.isDefault,
  };
}

const inclureZone = {
  area: { include: { region: { select: { id: true, name: true } } } },
} as const;

export function routesCompte(
  prisma: PrismaClient,
  auth: Auth,
): Hono<{ Variables: { session: Session } }> {
  // La session posée par la garde est déclarée ici : sans ce typage, chaque route
  // devrait la relire elle-même, ce qui multiplierait les appels à la base.
  const routes = new Hono<{ Variables: { session: Session } }>();

  // Une seule garde pour tout le préfixe : ajouter une route ici ne peut pas
  // accidentellement ouvrir le carnet d'une inconnue.
  routes.use("/compte/*", exigerConnexion(auth, prisma));

  routes.patch("/compte/profil", validation(schemaProfil), async (c) => {
    const session = c.get("session");
    const { name, phone } = c.req.valid("json");

    // Le nom passe par Better Auth : les sessions sont mises en cache hors de la base,
    // et l'écrire directement en table laisserait servir l'ancien jusqu'à expiration.
    // Le téléphone, qu'il ne connaît pas, est écrit par Prisma.
    await auth.api.updateUser({ body: { name }, headers: c.req.raw.headers });
    const utilisateur = await prisma.user.update({
      where: { id: session.userId },
      data: { phone: phone && phone.length > 0 ? phone : null },
      select: { name: true, email: true, phone: true },
    });

    // L'adresse e-mail n'est pas modifiable ici : elle identifie le compte et rattache
    // les commandes passées en invitée. La changer demande de confirmer la nouvelle,
    // sans quoi une faute de frappe fermerait l'accès au compte.
    return c.json({
      name: utilisateur.name,
      email: utilisateur.email,
      phone: utilisateur.phone ?? undefined,
      isAdmin: session.estAdmin,
    });
  });

  routes.get("/compte/adresses", async (c) => {
    const session = c.get("session");
    const adresses = await prisma.address.findMany({
      where: { userId: session.userId },
      // Celle proposée d'office en tête, puis la plus récente.
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      include: inclureZone,
    });
    return c.json({ items: adresses.map(versAdresse) }, 200, { "Cache-Control": "no-store" });
  });

  routes.post("/compte/adresses", validation(schemaAdresse), async (c) => {
    const session = c.get("session");
    const donnees = c.req.valid("json");

    const adresse = await prisma.$transaction(async (tx) => {
      await verifierZone(tx, donnees.areaId);
      const nombre = await tx.address.count({ where: { userId: session.userId } });
      // La première adresse devient celle proposée d'office : sans cela, la cliente
      // devrait la désigner explicitement alors qu'il n'y a pas de choix à faire.
      const parDefaut = donnees.isDefault === true || nombre === 0;
      if (parDefaut) await retirerLesAutresDefauts(tx, session.userId);

      return tx.address.create({
        data: {
          userId: session.userId,
          label: donnees.label,
          fullName: donnees.fullName,
          phone: donnees.phone,
          areaId: donnees.areaId,
          address: donnees.address,
          note: donnees.note && donnees.note.length > 0 ? donnees.note : null,
          isDefault: parDefaut,
        },
        include: inclureZone,
      });
    });

    return c.json(versAdresse(adresse), 201);
  });

  routes.put("/compte/adresses/:id", validation(schemaAdresse), async (c) => {
    const session = c.get("session");
    const id = c.req.param("id");
    const donnees = c.req.valid("json");

    const adresse = await prisma.$transaction(async (tx) => {
      await exigerSienne(tx, id, session.userId);
      await verifierZone(tx, donnees.areaId);
      if (donnees.isDefault === true) await retirerLesAutresDefauts(tx, session.userId);

      return tx.address.update({
        where: { id },
        data: {
          label: donnees.label,
          fullName: donnees.fullName,
          phone: donnees.phone,
          areaId: donnees.areaId,
          address: donnees.address,
          note: donnees.note && donnees.note.length > 0 ? donnees.note : null,
          ...(donnees.isDefault === true ? { isDefault: true } : {}),
        },
        include: inclureZone,
      });
    });

    return c.json(versAdresse(adresse));
  });

  routes.delete("/compte/adresses/:id", async (c) => {
    const session = c.get("session");
    const id = c.req.param("id");

    await prisma.$transaction(async (tx) => {
      const existante = await exigerSienne(tx, id, session.userId);
      await tx.address.delete({ where: { id } });

      // Le carnet ne doit pas rester sans adresse proposée d'office : la suivante
      // prend le relais, sinon la commande repartirait d'un formulaire vide.
      if (existante.isDefault) {
        const suivante = await tx.address.findFirst({
          where: { userId: session.userId },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (suivante)
          await tx.address.update({ where: { id: suivante.id }, data: { isDefault: true } });
      }
    });

    return c.json({ supprime: true });
  });

  return routes;
}

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Vérifie que l'adresse appartient bien à la session, et la renvoie.
 *
 * Le même message pour une adresse inexistante et pour celle d'une autre personne :
 * distinguer les deux dirait à qui essaie quels identifiants existent.
 */
async function exigerSienne(
  tx: Transaction,
  id: string,
  userId: string,
): Promise<{ isDefault: boolean }> {
  const adresse = await tx.address.findFirst({
    where: { id, userId },
    select: { isDefault: true },
  });
  if (!adresse) throw new ErreurApi("INTROUVABLE", "Adresse introuvable.");
  return adresse;
}

/** Refuse une zone qui n'est pas au catalogue de livraison. */
async function verifierZone(tx: Transaction, areaId: string): Promise<void> {
  const zone = await tx.deliveryArea.findUnique({ where: { id: areaId }, select: { id: true } });
  if (!zone) throw new ErreurApi("VALIDATION", "Cette zone de livraison n'existe pas.");
}

/** Une seule adresse proposée d'office à la fois. */
async function retirerLesAutresDefauts(tx: Transaction, userId: string): Promise<void> {
  await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
}
