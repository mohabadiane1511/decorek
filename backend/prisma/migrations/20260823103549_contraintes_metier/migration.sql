-- Garde-fous que le langage de Prisma ne sait pas exprimer.
-- Ils doublent les validations applicatives : une erreur de code ne doit pas pouvoir
-- écrire une donnée incohérente, surtout sur les montants et le stock.

-- Le contenu du site est un singleton : une seule ligne, toujours l'identifiant 1.
ALTER TABLE "site_content"
  ADD CONSTRAINT "site_content_ligne_unique" CHECK ("id" = 1);

-- Aucun montant négatif. Le prix barré, s'il existe, doit dépasser le prix courant,
-- sans quoi la promotion affichée serait mensongère.
ALTER TABLE "products"
  ADD CONSTRAINT "products_price_positif" CHECK ("price" >= 0),
  ADD CONSTRAINT "products_old_price_coherent" CHECK ("old_price" IS NULL OR "old_price" > "price"),
  ADD CONSTRAINT "products_seuil_positif" CHECK ("low_stock_threshold" >= 0);

-- Filet contre la survente : même si le code se trompe, la base refuse de descendre
-- sous zéro. La transaction échoue au lieu de vendre un article qui n'existe pas.
ALTER TABLE "products"
  ADD CONSTRAINT "products_stock_jamais_negatif" CHECK ("stock" >= 0);

-- Une ligne de commande porte au moins un article, à un prix qui n'est pas négatif.
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantite_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_items_prix_positif" CHECK ("price" >= 0);

-- Cohérence monétaire d'une commande : la remise ne peut pas dépasser le sous-total,
-- et le total doit être exactement sous-total moins remise plus frais de livraison.
-- C'est la règle que la maquette calculait côté navigateur.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_montants_positifs" CHECK (
    "subtotal" >= 0 AND "discount" >= 0 AND "delivery_fee" >= 0 AND "total" >= 0
  ),
  ADD CONSTRAINT "orders_remise_plafonnee" CHECK ("discount" <= "subtotal"),
  ADD CONSTRAINT "orders_total_coherent" CHECK ("total" = "subtotal" - "discount" + "delivery_fee");

-- Une promotion a une valeur strictement positive et une fenêtre de validité qui
-- s'ouvre avant de se fermer.
ALTER TABLE "promo_codes"
  ADD CONSTRAINT "promo_valeur_positive" CHECK ("value" > 0),
  ADD CONSTRAINT "promo_minimum_positif" CHECK ("min_amount" >= 0),
  ADD CONSTRAINT "promo_utilisations_positives" CHECK ("max_uses" > 0),
  ADD CONSTRAINT "promo_fenetre_valide" CHECK ("ends_at" > "starts_at");

-- Une remise en pourcentage ne dépasse pas 100.
ALTER TABLE "promo_codes"
  ADD CONSTRAINT "promo_pourcentage_plafonne" CHECK (
    "type" <> 'percent' OR "value" <= 100
  );

-- Les frais de livraison ne sont jamais négatifs.
ALTER TABLE "delivery_areas"
  ADD CONSTRAINT "delivery_areas_frais_positifs" CHECK ("fee" >= 0);

-- Un mouvement de stock nul n'a pas de sens : il faut une entrée ou une sortie.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_delta_non_nul" CHECK ("delta" <> 0);

-- La période d'un compteur de numéros est bien un YYMM, et le compteur ne recule pas.
ALTER TABLE "order_number_counters"
  ADD CONSTRAINT "order_counters_periode_valide" CHECK ("period" ~ '^[0-9]{4}$'),
  ADD CONSTRAINT "order_counters_positif" CHECK ("counter" >= 0);
