import type { Category, DeliveryRegion, Order, Product, PromoCode, SiteContent } from "./types";

const anneaux = "/images/anneauxserviettedetable.jpg";
const chaise = "/images/chaiseroyale.png";
const chemin = "/images/chemindetable.jpg";
const verres = "/images/ensemblverre.jpg";
const guirlande = "/images/guirlandeislamique.jpg";
const housse = "/images/houssecanape.jpg";
const mural = "/images/muralbambou.jpg";
const sousAssiettes = "/images/sousassiettes.jpg";

export const seedCategories: Category[] = [
  {
    id: "c1",
    slug: "art-de-la-table",
    name: "Art de la table",
    description: "Verrerie, sous-assiettes et accessoires pour des tables raffinées.",
  },
  {
    id: "c2",
    slug: "decoration-murale",
    name: "Décoration murale",
    description: "Miroirs, cadres et pièces artisanales pour habiller vos murs.",
  },
  {
    id: "c3",
    slug: "textile-maison",
    name: "Textile & maison",
    description: "Housses, chemins de table et textiles d'intérieur.",
  },
  {
    id: "c4",
    slug: "mobilier-evenementiel",
    name: "Mobilier événementiel",
    description: "Chaises et mobilier de réception pour vos cérémonies.",
  },
  {
    id: "c5",
    slug: "luminaires",
    name: "Luminaires & guirlandes",
    description: "Lumières décoratives pour créer une atmosphère chaleureuse.",
  },
];

export const seedProducts: Product[] = [
  {
    id: "p1",
    slug: "sous-assiette-solaire-doree",
    name: "Sous-assiette solaire dorée",
    categoryId: "c1",
    price: 8500,
    oldPrice: 10000,
    stock: 24,
    lowStockThreshold: 5,
    description:
      "Sous-assiette en métal doré au motif solaire, finition miroir. Pièce maîtresse d'une table de réception, elle sublime assiettes blanches et verrerie ciselée.",
    images: [sousAssiettes],
    featured: true,
    createdAt: "2026-06-02",
  },
  {
    id: "p2",
    slug: "ensemble-carafe-6-verres",
    name: "Ensemble carafe & 6 verres striés",
    categoryId: "c1",
    price: 27500,
    stock: 12,
    lowStockThreshold: 4,
    description:
      "Carafe et six verres en verre strié cerclés d'un liseré doré, livrés en coffret. Idéal pour le service du jus ou de l'eau lors des grandes occasions.",
    images: [verres],
    featured: true,
    createdAt: "2026-06-20",
  },
  {
    id: "p3",
    slug: "anneaux-serviette-ginkgo",
    name: "Anneaux de serviette Ginkgo (x6)",
    categoryId: "c1",
    price: 12000,
    stock: 3,
    lowStockThreshold: 5,
    description:
      "Lot de six anneaux de serviette en métal doré, feuille de ginkgo finement ciselée. Le détail qui transforme une table dressée.",
    images: [anneaux],
    featured: true,
    createdAt: "2026-07-01",
  },
  {
    id: "p4",
    slug: "miroir-goutte-bambou",
    name: "Miroir goutte en bambou tressé",
    categoryId: "c2",
    price: 32000,
    stock: 6,
    lowStockThreshold: 3,
    description:
      "Miroir mural en forme de goutte, encadrement en bambou tressé à la main. Vendu à l'unité, superbe en duo dans une entrée.",
    images: [mural],
    featured: true,
    createdAt: "2026-05-14",
  },
  {
    id: "p5",
    slug: "chemin-de-table-gaze-coton",
    name: "Chemin de table en gaze de coton",
    categoryId: "c3",
    price: 9500,
    stock: 40,
    lowStockThreshold: 8,
    description:
      "Chemin de table en gaze de coton froissée, 3 mètres, finition franges. Disponible en plusieurs teintes : terracotta, blanc, vert sapin, bordeaux.",
    images: [chemin],
    featured: false,
    createdAt: "2026-06-28",
  },
  {
    id: "p6",
    slug: "housse-canape-matelassee",
    name: "Housse de canapé matelassée",
    categoryId: "c3",
    price: 24000,
    oldPrice: 29000,
    stock: 9,
    lowStockThreshold: 4,
    description:
      "Housse de canapé antidérapante, tissu matelassé bicolore avec liseré doré. Protège le canapé tout en apportant une touche contemporaine.",
    images: [housse],
    featured: true,
    createdAt: "2026-07-08",
  },
  {
    id: "p7",
    slug: "chaise-royale-doree",
    name: "Chaise royale dorée",
    categoryId: "c4",
    price: 45000,
    stock: 18,
    lowStockThreshold: 6,
    description:
      "Chaise de réception à structure inox doré et assise simili blanc. Confortable et élégante, pensée pour les mariages et cérémonies.",
    images: [chaise],
    featured: true,
    createdAt: "2026-04-19",
  },
  {
    id: "p8",
    slug: "guirlande-lumineuse-lanternes",
    name: "Guirlande lumineuse lanternes",
    categoryId: "c5",
    price: 7000,
    stock: 2,
    lowStockThreshold: 6,
    description:
      "Guirlande LED à motifs lanternes et croissants, lumière ambrée douce. Fonctionne sur piles ou USB, 3 mètres.",
    images: [guirlande],
    featured: false,
    createdAt: "2026-07-15",
  },
];

export const seedRegions: DeliveryRegion[] = [
  {
    id: "r1",
    name: "Dakar",
    areas: [
      { id: "a1", name: "Plateau", fee: 2000 },
      { id: "a2", name: "Almadies", fee: 2500 },
      { id: "a3", name: "Ouakam", fee: 2500 },
      { id: "a4", name: "Point E / Fann", fee: 2000 },
      { id: "a5", name: "Médina", fee: 2000 },
      { id: "a6", name: "Yoff", fee: 3000 },
      { id: "a7", name: "Grand Yoff", fee: 3000 },
      { id: "a8", name: "Parcelles Assainies", fee: 3000 },
    ],
  },
  {
    id: "r2",
    name: "Banlieue de Dakar",
    areas: [
      { id: "a9", name: "Pikine", fee: 3500 },
      { id: "a10", name: "Guédiawaye", fee: 3500 },
      { id: "a11", name: "Rufisque", fee: 4000 },
      { id: "a12", name: "Diamniadio", fee: 4500 },
    ],
  },
  {
    id: "r3",
    name: "Thiès",
    areas: [
      { id: "a13", name: "Thiès ville", fee: 5000 },
      { id: "a14", name: "Mbour / Saly", fee: 6000 },
    ],
  },
  {
    id: "r4",
    name: "Saint-Louis",
    areas: [{ id: "a15", name: "Saint-Louis ville", fee: 7000 }],
  },
  {
    id: "r5",
    name: "Ziguinchor",
    areas: [{ id: "a16", name: "Ziguinchor ville", fee: 8000 }],
  },
];

export const seedPromos: PromoCode[] = [
  {
    id: "pr1",
    code: "BIENVENUE10",
    type: "percent",
    value: 10,
    minAmount: 20000,
    startsAt: "2026-01-01",
    endsAt: "2026-12-31",
    maxUses: 200,
    uses: 34,
    active: true,
  },
  {
    id: "pr2",
    code: "TABLE5000",
    type: "amount",
    value: 5000,
    minAmount: 50000,
    startsAt: "2026-06-01",
    endsAt: "2026-09-30",
    maxUses: 100,
    uses: 12,
    active: true,
  },
];

export const seedOrders: Order[] = [
  {
    id: "o1",
    number: "DR-2608-1042",
    createdAt: "2026-08-18T10:12:00.000Z",
    customer: { name: "Awa Diop", phone: "+221 77 123 45 67", email: "awa.diop@example.sn" },
    delivery: {
      regionId: "r1",
      regionName: "Dakar",
      areaName: "Almadies",
      address: "Route des Almadies, villa 12",
      fee: 2500,
    },
    items: [
      { productId: "p1", name: "Sous-assiette solaire dorée", price: 8500, quantity: 6, image: sousAssiettes },
      { productId: "p3", name: "Anneaux de serviette Ginkgo (x6)", price: 12000, quantity: 1, image: anneaux },
    ],
    subtotal: 63000,
    discount: 6300,
    promoCode: "BIENVENUE10",
    total: 59200,
    status: "livree",
    paid: true,
    userEmail: "awa.diop@example.sn",
  },
  {
    id: "o2",
    number: "DR-2608-1043",
    createdAt: "2026-08-19T16:40:00.000Z",
    customer: { name: "Moussa Fall", phone: "+221 78 998 22 10" },
    delivery: {
      regionId: "r2",
      regionName: "Banlieue de Dakar",
      areaName: "Rufisque",
      address: "Quartier Keury Kao, près du marché",
      fee: 4000,
    },
    items: [{ productId: "p7", name: "Chaise royale dorée", price: 45000, quantity: 4, image: chaise }],
    subtotal: 180000,
    discount: 0,
    total: 184000,
    status: "en_livraison",
    paid: false,
  },
  {
    id: "o3",
    number: "DR-2608-1044",
    createdAt: "2026-08-20T09:05:00.000Z",
    customer: { name: "Fatou Ndiaye", phone: "+221 76 445 09 88", email: "fatou.n@example.sn" },
    delivery: {
      regionId: "r1",
      regionName: "Dakar",
      areaName: "Point E / Fann",
      address: "Rue 5 x Avenue Cheikh Anta Diop",
      fee: 2000,
    },
    items: [
      { productId: "p2", name: "Ensemble carafe & 6 verres striés", price: 27500, quantity: 1, image: verres },
      { productId: "p5", name: "Chemin de table en gaze de coton", price: 9500, quantity: 2, image: chemin },
    ],
    subtotal: 46500,
    discount: 0,
    total: 48500,
    status: "confirmee",
    paid: false,
    userEmail: "fatou.n@example.sn",
  },
  {
    id: "o4",
    number: "DR-2608-1045",
    createdAt: "2026-08-20T18:22:00.000Z",
    customer: { name: "Cheikh Sarr", phone: "+221 70 332 71 04" },
    delivery: {
      regionId: "r3",
      regionName: "Thiès",
      areaName: "Mbour / Saly",
      address: "Résidence Saly Nord",
      fee: 6000,
    },
    items: [{ productId: "p4", name: "Miroir goutte en bambou tressé", price: 32000, quantity: 2, image: mural }],
    subtotal: 64000,
    discount: 0,
    total: 70000,
    status: "en_attente",
    paid: false,
  },
  {
    id: "o5",
    number: "DR-2608-1046",
    createdAt: "2026-08-21T07:15:00.000Z",
    customer: { name: "Ndeye Gueye", phone: "+221 77 880 15 22" },
    delivery: {
      regionId: "r1",
      regionName: "Dakar",
      areaName: "Ouakam",
      address: "Cité Avion, villa 44",
      fee: 2500,
    },
    items: [
      { productId: "p6", name: "Housse de canapé matelassée", price: 24000, quantity: 1, image: housse },
      { productId: "p8", name: "Guirlande lumineuse lanternes", price: 7000, quantity: 3, image: guirlande },
    ],
    subtotal: 45000,
    discount: 0,
    total: 47500,
    status: "preparation",
    paid: false,
  },
];

export const seedContent: SiteContent = {
  bannerTitle: "L'art de recevoir, version sénégalaise",
  bannerSubtitle: "Vaisselle et décoration d'exception, choisies pour sublimer votre intérieur.",
  bannerCta: "Découvrir la collection",
  whatsapp: "221771234567",
  phone: "+221 77 123 45 67",
  email: "contact@decorek.sn",
  address: "Sacré-Cœur 3, Dakar, Sénégal",
  freeShippingFrom: 100000,
  pages: {
    contact:
      "Notre équipe vous répond du lundi au samedi, de 9h à 19h. Écrivez-nous sur WhatsApp pour une réponse immédiate, ou passez à la boutique de Sacré-Cœur 3 pour découvrir les pièces en vrai.",
    livraison:
      "Nous livrons partout à Dakar en 24 à 48h et dans les régions sous 2 à 5 jours ouvrés. Les frais dépendent de votre quartier ou de votre région et s'affichent automatiquement au moment de la commande. Le paiement se fait uniquement à la livraison, en espèces ou par transfert mobile, après vérification de votre colis.",
    apropos:
      "Deco'Rek sélectionne des pièces de vaisselle, de décoration et de mobilier pour les intérieurs et les cérémonies au Sénégal. Chaque collection est choisie pour sa qualité, sa finition et sa capacité à sublimer un moment partagé.",
    cgv: "Les prix sont affichés en FCFA, toutes taxes comprises. La commande est validée dès sa soumission ; le règlement s'effectue à la réception du colis. Tout article peut être échangé sous 7 jours s'il est retourné dans son emballage d'origine. Les commandes refusées à la livraison sans motif peuvent entraîner la demande d'un acompte pour les commandes suivantes.",
  },
};
