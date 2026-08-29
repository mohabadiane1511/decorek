export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string;
};

export type Product = {
  id: string;
  slug: string;
  /** Référence interne, attribuée par le serveur. Absente des articles d'avant. */
  sku?: string | undefined;
  name: string;
  categoryId: string;
  price: number; // FCFA
  oldPrice?: number | undefined;
  stock: number;
  lowStockThreshold: number;
  description: string;
  images: string[];
  featured: boolean;
  createdAt: string;
};

/** Comment la cliente règle sa commande. « especes » n'existe plus que dans l'historique. */
export type PaymentMethod = "especes" | "wave" | "orange_money";

export type OrderStatus =
  | "en_attente"
  | "paiement_annonce"
  | "confirmee"
  | "preparation"
  | "en_livraison"
  | "livree"
  | "non_honoree"
  | "annulee";

export type OrderItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
};

export type Order = {
  id: string;
  number: string;
  createdAt: string;
  customer: {
    name: string;
    phone: string;
    email?: string | undefined;
  };
  delivery: {
    regionId: string;
    regionName: string;
    areaName: string;
    address: string;
    fee: number;
    note?: string | undefined;
  };
  items: OrderItem[];
  subtotal: number;
  discount: number;
  promoCode?: string | undefined;
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paid: boolean;
  userEmail?: string | undefined;
  internalNote?: string | undefined;
};

export type PromoCode = {
  id: string;
  code: string;
  type: "percent" | "amount";
  value: number;
  minAmount: number;
  startsAt: string;
  endsAt: string;
  maxUses: number;
  uses: number;
  active: boolean;
};

export type DeliveryArea = {
  id: string;
  name: string;
  fee: number;
};

export type DeliveryRegion = {
  id: string;
  name: string;
  areas: DeliveryArea[];
};

export type SiteContent = {
  bannerTitle: string;
  bannerSubtitle: string;
  bannerCta: string;
  whatsapp: string;
  /** Numéros où la cliente envoie son paiement. Vides tant qu'ils ne sont pas renseignés. */
  waveNumber: string;
  orangeMoneyNumber: string;
  /**
   * Réseaux sociaux. Chaîne vide = absent du site : le lien n'est affiché que si la
   * page existe, plutôt que de mener vers un compte inexistant.
   */
  facebook: string;
  instagram: string;
  tiktok: string;
  snapchat: string;
  phone: string;
  email: string;
  address: string;
  freeShippingFrom: number;
  pages: {
    contact: string;
    livraison: string;
    apropos: string;
    cgv: string;
  };
};

export type SessionUser = {
  name: string;
  email: string;
  phone?: string | undefined;
  isAdmin: boolean;
};

/**
 * Adresse enregistrée dans le carnet de la cliente.
 *
 * `areaId` peut être absent : la zone de livraison qu'elle désignait a pu être retirée
 * du catalogue. L'adresse reste alors lisible, mais demande à être revue avant de
 * servir — elle ne peut plus annoncer de frais.
 */
export type Address = {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  areaId?: string | undefined;
  regionId?: string | undefined;
  regionName?: string | undefined;
  areaName?: string | undefined;
  fee?: number | undefined;
  address: string;
  note?: string | undefined;
  isDefault: boolean;
};
