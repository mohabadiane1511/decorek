-- Référence interne des articles.
-- Nullable : les produits créés avant cette migration n'en ont pas, et Postgres
-- autorise plusieurs valeurs nulles sous une contrainte d'unicité.
ALTER TABLE "products" ADD COLUMN     "sku" TEXT;

-- Compteur des références. Une seule ligne : compter les produits existants
-- donnerait deux fois la même référence après une suppression.
CREATE TABLE "sku_counters" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sku_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- Les articles déjà en base reçoivent leur référence, dans l'ordre de création, et le
-- compteur repart de là : sans cela, le premier article créé ensuite reprendrait
-- « DR-0001 », déjà attribué.
WITH numerotes AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rang FROM "products"
)
UPDATE "products" p
   SET "sku" = 'DR-' || LPAD(n.rang::text, 4, '0')
  FROM numerotes n
 WHERE p.id = n.id;

INSERT INTO "sku_counters" ("id", "counter")
VALUES (1, (SELECT COUNT(*) FROM "products"));
