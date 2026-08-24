import { z } from "zod";

// La configuration est validée au démarrage, pas à la première requête : mieux vaut un
// service qui refuse de démarrer qu'un service qui tombe en pleine commande.
const schemaConfig = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL est requise"),
  REDIS_URL: z.string().min(1, "REDIS_URL est requise"),
  S3_ENDPOINT: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  MEDIA_PREFIX: z.string().default("/media"),
});

export type Config = z.infer<typeof schemaConfig>;

export function lireConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultat = schemaConfig.safeParse(env);
  if (!resultat.success) {
    const details = resultat.error.issues
      .map((i) => `  - ${i.path.join(".")} : ${i.message}`)
      .join("\n");
    throw new Error(`Configuration invalide :\n${details}\n\nVoir backend/.env.example`);
  }
  return resultat.data;
}
