import { execFileSync } from "node:child_process";
import { config as loadEnv } from "dotenv";

// Prépare la base de test avant toute exécution.
//
// On applique les migrations avec `migrate deploy`, jamais `migrate reset` : deploy est
// non destructif — il crée le schéma sur une base neuve et ne fait rien sur une base à
// jour. Le nettoyage des données est assuré par le beforeEach de chaque test, ce qui
// suffit et évite de garder une commande capable d'effacer une base entière dans
// l'outillage quotidien.
//
// Reconstruire depuis les migrations versionnées, et non par un `db push`, fait partie
// de ce qu'on vérifie : que ces migrations produisent bien le schéma attendu.
export default function setup(): void {
  loadEnv({ path: new URL("../.env", import.meta.url).pathname, quiet: true });

  const url = process.env["TEST_DATABASE_URL"];
  if (!url) {
    throw new Error("TEST_DATABASE_URL manquante — voir backend/.env.example");
  }
  if (!/\/decorek_test(\?|$)/.test(url)) {
    // Les tests vident les tables : ils ne doivent jamais viser la base de travail.
    throw new Error(`TEST_DATABASE_URL ne pointe pas sur decorek_test : ${url}`);
  }

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
    stdio: "pipe",
  });
}
