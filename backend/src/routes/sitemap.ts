import { Hono } from "hono";
import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * Plan du site, construit depuis la base.
 *
 * Écrit à la main, il serait faux dès le premier article ajouté par la boutique — et
 * c'est justement à ce moment-là qu'on veut être indexé vite. Les pages de gestion et
 * les parcours d'achat en sont absents : ils n'ont rien à faire dans un moteur de
 * recherche, et le back-office porte déjà « noindex ».
 */

/** Pages fixes, avec l'importance relative que leur accorde un moteur. */
const PAGES = [
  { chemin: "/", priorite: "1.0", frequence: "daily" },
  { chemin: "/boutique", priorite: "0.9", frequence: "daily" },
  { chemin: "/a-propos", priorite: "0.5", frequence: "monthly" },
  { chemin: "/contact", priorite: "0.5", frequence: "monthly" },
  { chemin: "/livraison", priorite: "0.6", frequence: "monthly" },
  { chemin: "/cgv", priorite: "0.3", frequence: "yearly" },
  { chemin: "/confidentialite", priorite: "0.3", frequence: "yearly" },
] as const;

/** Échappe ce qu'un identifiant d'URL pourrait contenir de gênant pour du XML. */
function xml(valeur: string): string {
  return valeur
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function routesSitemap(prisma: PrismaClient, siteUrl: string): Hono {
  const routes = new Hono();
  const site = siteUrl.replace(/\/$/, "");

  routes.get("/sitemap.xml", async (c) => {
    const [produits, categories] = await Promise.all([
      prisma.product.findMany({
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        // Borné : un plan démesuré est ignoré, et il faudrait alors le découper.
        take: 5000,
      }),
      prisma.category.findMany({ select: { slug: true } }),
    ]);

    const entrees = [
      ...PAGES.map((p) => ({
        url: `${site}${p.chemin}`,
        priorite: p.priorite,
        frequence: p.frequence,
        modifie: undefined as string | undefined,
      })),
      ...categories.map((cat) => ({
        url: `${site}/boutique?categorie=${encodeURIComponent(cat.slug)}`,
        priorite: "0.7",
        frequence: "weekly",
        modifie: undefined as string | undefined,
      })),
      ...produits.map((p) => ({
        url: `${site}/produit/${p.slug}`,
        priorite: "0.8",
        frequence: "weekly",
        // La date de dernière modification évite au moteur de revisiter inutilement ce
        // qui n'a pas bougé.
        modifie: p.updatedAt.toISOString().slice(0, 10),
      })),
    ];

    const corps = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entrees
  .map(
    (e) =>
      `  <url>\n    <loc>${xml(e.url)}</loc>\n${
        e.modifie ? `    <lastmod>${e.modifie}</lastmod>\n` : ""
      }    <changefreq>${e.frequence}</changefreq>\n    <priority>${e.priorite}</priority>\n  </url>`,
  )
  .join("\n")}
</urlset>
`;

    return c.body(corps, 200, {
      "Content-Type": "application/xml; charset=utf-8",
      // Une heure : assez pour soulager la base, assez court pour qu'un article publié
      // le matin soit proposé à l'indexation dans la journée.
      "Cache-Control": "public, max-age=3600",
    });
  });

  return routes;
}
