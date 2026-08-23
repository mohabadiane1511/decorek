import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export function creerClient(connectionString: string): PrismaClient {
  // Prisma 7 n'embarque plus de moteur Rust : la connexion passe par un adaptateur
  // explicite, ici le pilote pg. C'est aussi ce qui allège l'image Docker.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Pas d'instance créée au niveau du module : les imports ES sont évalués avant toute
// autre instruction, donc un client construit ici exigerait DATABASE_URL avant même
// que le fichier .env ait pu être chargé.
export function clientDepuisEnv(env: NodeJS.ProcessEnv = process.env): PrismaClient {
  const url = env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL manquante — copier backend/.env.example en backend/.env");
  return creerClient(url);
}
