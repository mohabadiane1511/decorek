import { z } from "zod";

// La configuration est validée au démarrage, pas à la première requête : mieux vaut un
// service qui refuse de démarrer qu'un service qui tombe en pleine commande.
const schemaConfig = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL est requise"),
  REDIS_URL: z.string().min(1, "REDIS_URL est requise"),
  // Signe les sessions. Un secret court ou deviné permettrait de forger des cookies :
  // 32 caractères au minimum, générés aléatoirement (openssl rand -base64 32).
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET doit faire au moins 32 caractères"),
  AUTH_URL: z.string().min(1).default("http://localhost:8080"),
  // Messagerie. En développement, Mailpit accepte tout sans authentification ; en
  // production, SMTP_USER et SMTP_PASSWORD deviennent obligatoires côté fournisseur.
  SMTP_HOST: z.string().min(1).default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === "true" || v === "1")
    .default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().min(1).default("Deco'Rek <contact@decorek.sn>"),

  S3_ENDPOINT: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  // Endpoint joignable depuis le navigateur. En développement, MinIO exposé sur le
  // poste ; en production, le domaine public. Les URL de téléversement sont signées
  // pour cette adresse : les signer pour le nom interne les rendrait inutilisables.
  S3_PUBLIC_ENDPOINT: z.string().min(1).default("http://localhost:59000"),
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
