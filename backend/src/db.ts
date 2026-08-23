import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export function creerClient(connectionString: string): PrismaClient {
  // Prisma 7 n'embarque plus de moteur Rust : la connexion passe par un adaptateur
  // explicite, ici le pilote pg. C'est aussi ce qui rend l'image Docker plus légère.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function urlRequise(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL manquante — copier backend/.env.example en backend/.env");
  return url;
}

export const prisma = creerClient(urlRequise());
