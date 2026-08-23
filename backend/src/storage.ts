import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type ConfigStockage = {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  prefix: string;
};

export function lireConfigStockage(env: NodeJS.ProcessEnv = process.env): ConfigStockage {
  const requis = (nom: string): string => {
    const valeur = env[nom];
    if (!valeur) throw new Error(`${nom} manquante — voir backend/.env.example`);
    return valeur;
  };
  return {
    endpoint: requis("S3_ENDPOINT"),
    accessKey: requis("S3_ACCESS_KEY"),
    secretKey: requis("S3_SECRET_KEY"),
    bucket: requis("S3_BUCKET"),
    prefix: env["MEDIA_PREFIX"] ?? "/media",
  };
}

export function creerClientStockage(config: ConfigStockage): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: "us-east-1", // MinIO ignore la région, mais le SDK en exige une.
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    // MinIO expose les buckets en chemin (/bucket/objet) et non en sous-domaine.
    forcePathStyle: true,
  });
}

const TYPES_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

export function typeMime(nomFichier: string): string {
  const ext = nomFichier.split(".").pop()?.toLowerCase() ?? "";
  return TYPES_MIME[ext] ?? "application/octet-stream";
}

export async function objetExiste(client: S3Client, bucket: string, cle: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: cle }));
    return true;
  } catch {
    return false;
  }
}

/** Dépose un objet et renvoie le chemin à enregistrer en base (ex. /media/photo.jpg). */
export async function deposerObjet(
  client: S3Client,
  config: ConfigStockage,
  cle: string,
  contenu: Uint8Array,
): Promise<string> {
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: cle,
      Body: contenu,
      ContentType: typeMime(cle),
    }),
  );
  return `${config.prefix}/${cle}`;
}

/** URL directement joignable, pour le développement et les tests. */
export function urlPublique(config: ConfigStockage, cheminOuCle: string): string {
  const cle = cheminOuCle.startsWith(config.prefix)
    ? cheminOuCle.slice(config.prefix.length + 1)
    : cheminOuCle;
  return `${config.endpoint}/${config.bucket}/${cle}`;
}
