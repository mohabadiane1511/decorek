-- DropIndex
DROP INDEX "stock_movements_order_id_product_id_reason_key";

-- CreateIndex
CREATE INDEX "stock_movements_order_id_idx" ON "stock_movements"("order_id");
