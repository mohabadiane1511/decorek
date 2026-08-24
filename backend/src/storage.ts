import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

export type ConfigStockage = {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  prefix: string;
  /** Adresse joignable depuis le navigateur. */
  publicEndpoint: string;
};

/** Construit la configuration du stockage depuis la configuration validée du service. */
export function configStockageDepuis(config: {
  S3_ENDPOINT: string;
  S3_ACCESS_KEY: string;
  S3_SECRET_KEY: string;
  S3_BUCKET: string;
  S3_PUBLIC_ENDPOINT: string;
  MEDIA_PREFIX: string;
}): ConfigStockage {
  return {
    endpoint: config.S3_ENDPOINT,
    accessKey: config.S3_ACCESS_KEY,
    secretKey: config.S3_SECRET_KEY,
    bucket: config.S3_BUCKET,
    prefix: config.MEDIA_PREFIX,
    publicEndpoint: config.S3_PUBLIC_ENDPOINT,
  };
}

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
    publicEndpoint: env["S3_PUBLIC_ENDPOINT"] ?? requis("S3_ENDPOINT"),
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

/** Types acceptés pour une image de produit. */
export const TYPES_IMAGE_AUTORISES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/** 8 Mo : au-delà, c'est une photo non retouchée qui pénaliserait le chargement. */
export const TAILLE_IMAGE_MAX = 8 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/**
 * Prépare un téléversement direct du navigateur vers le stockage.
 *
 * Le fichier ne transite pas par l'API : une photo de plusieurs mégaoctets n'a rien à
 * faire dans la mémoire du serveur, et l'envoi direct reste rapide même sur une
 * connexion moyenne.
 *
 * Le nom du fichier est engendré ici, jamais repris de celui fourni par le client :
 * un nom choisi par l'appelant permettrait d'écraser une image existante, et un nom
 * contenant des séparateurs de chemin pourrait viser un autre emplacement du bucket.
 */
export async function preparerTeleversement(
  config: ConfigStockage,
  typeMimeDemande: string,
): Promise<{ url: string; cle: string; chemin: string }> {
  if (!TYPES_IMAGE_AUTORISES.includes(typeMimeDemande)) {
    throw new Error(`Type de fichier non accepté : ${typeMimeDemande}`);
  }

  const extension = EXTENSIONS[typeMimeDemande] ?? "bin";
  const cle = `produits/${randomUUID()}.${extension}`;

  // Client signé pour l'adresse publique : une URL signée pour le nom interne du
  // service serait injoignable depuis un navigateur.
  const clientPublic = creerClientStockage({ ...config, endpoint: config.publicEndpoint });

  const url = await getSignedUrl(
    clientPublic,
    new PutObjectCommand({ Bucket: config.bucket, Key: cle, ContentType: typeMimeDemande }),
    // Courte durée : l'autorisation ne sert qu'à l'envoi en cours.
    { expiresIn: 300 },
  );

  return { url, cle, chemin: `${config.prefix}/${cle}` };
}

/** Supprime un objet, en tolérant qu'il ait déjà disparu. */
export async function supprimerObjet(client: S3Client, bucket: string, cle: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: cle })).catch(() => undefined);
}
