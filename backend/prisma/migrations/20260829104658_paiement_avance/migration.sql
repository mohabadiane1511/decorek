-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('especes', 'wave', 'orange_money');

-- AlterEnum
-- Inséré juste après « en attente » : c'est l'ordre du parcours, et un tri par
-- statut suivrait sinon un ordre trompeur.
ALTER TYPE "order_status" ADD VALUE 'paiement_annonce' AFTER 'en_attente';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "payment_method" "payment_method" NOT NULL DEFAULT 'especes';

-- AlterTable
ALTER TABLE "site_content" ADD COLUMN     "orange_money_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "wave_number" TEXT NOT NULL DEFAULT '';

