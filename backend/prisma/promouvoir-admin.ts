import { config as loadEnv } from "dotenv";
import { creerClient } from "../src/db.js";

/**
 * Accorde le rôle administrateur à un compte existant.
 *
 * Le rôle ne s'obtient que par cette commande, exécutée par quelqu'un qui a accès au
 * serveur. Aucune inscription ne peut le donner, et aucune adresse ne le confère : c'est
 * ce qui remplace la règle de la maquette où « admin@… » suffisait.
 *
 * Usage : npm run db:admin -- contact@deco-rek.com
 */
loadEnv({ path: new URL("../.env", import.meta.url).pathname, quiet: true });

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage : npm run db:admin -- <email>");
  process.exit(1);
}

const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("DATABASE_URL manquante — voir backend/.env.example");
  process.exit(1);
}

const prisma = creerClient(url);
try {
  const utilisateur = await prisma.user.findUnique({ where: { email } });
  if (!utilisateur) {
    console.error(
      `Aucun compte pour ${email}. Créez-le d'abord depuis la page /compte, puis relancez.`,
    );
    process.exit(1);
  }

  await prisma.userRole.upsert({
    where: { userId_role: { userId: utilisateur.id, role: "admin" } },
    create: { userId: utilisateur.id, role: "admin" },
    update: {},
  });

  // L'adresse est confirmée par la même occasion. Cette commande s'exécute déjà sur le
  // serveur, par quelqu'un qui y a accès : lui demander en plus d'aller cliquer sur un
  // lien reçu par e-mail n'ajouterait aucune garantie, et bloquerait la mise en route
  // si la messagerie n'est pas encore configurée.
  if (!utilisateur.emailVerified) {
    await prisma.user.update({ where: { id: utilisateur.id }, data: { emailVerified: true } });
    console.log("Adresse confirmée.");
  }

  console.log(`${email} est désormais administrateur.`);
} finally {
  await prisma.$disconnect();
}
