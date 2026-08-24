import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { seedContent } from "@/data/seed";
import { api, type DemandeCommande } from "@/lib/api";
import type {
  Category,
  DeliveryRegion,
  Order,
  OrderStatus,
  Product,
  PromoCode,
  SessionUser,
  SiteContent,
} from "@/data/types";

export type CartLine = { productId: string; quantity: number };

type State = {
  products: Product[];
  categories: Category[];
  orders: Order[];
  promos: PromoCode[];
  regions: DeliveryRegion[];
  content: SiteContent;
  cart: CartLine[];
  user: SessionUser | null;
};

// Tout vient de l'API. Seul `content` garde une valeur de départ, le temps du premier
// chargement : l'interface le lit sans attendre et afficherait sinon des champs vides.
const initialState: State = {
  products: [],
  categories: [],
  orders: [],
  promos: [],
  regions: [],
  content: seedContent,
  cart: [],
  user: null,
};

// Seul le panier est persisté. Le catalogue viendrait périmé, et la session vit
// désormais dans un cookie httpOnly que le navigateur ne peut pas lire.
const STORAGE_KEY = "decorek-panier-v2";

type EtatPersiste = Pick<State, "cart">;

type StoreValue = State & {
  ready: boolean;
  /** Message lisible si le chargement initial a échoué, `null` sinon. */
  erreurChargement: string | null;
  rafraichir: () => void;
  addToCart: (productId: string, quantity?: number) => void;
  setCartQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  cartCount: number;
  cartSubtotal: number;
  /** Connexion réelle : la session vit dans un cookie posé par le serveur. */
  signIn: (email: string, motDePasse: string) => Promise<void>;
  inscrire: (nom: string, email: string, motDePasse: string) => Promise<void>;
  signOut: () => Promise<void>;
  validatePromo: (
    code: string,
    subtotal: number,
  ) => { promo: PromoCode; discount: number } | { error: string };
  /** Envoie la commande au serveur, qui calcule les montants et renvoie la commande créée. */
  placeOrder: (demande: DemandeCommande) => Promise<Order>;
  // Écritures du back-office : toutes passent par l'API et sont donc asynchrones.
  // C'est le second changement de signature annoncé au plan, après signIn.
  updateOrder: (id: string, patch: Partial<Order>) => Promise<void>;
  setOrderStatus: (id: string, status: OrderStatus) => Promise<void>;
  saveProduct: (product: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  saveCategory: (category: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  savePromo: (promo: PromoCode) => Promise<void>;
  deletePromo: (id: string) => Promise<void>;
  setRegions: (regions: DeliveryRegion[]) => Promise<void>;
  setContent: (content: SiteContent) => Promise<void>;
  /** Recharge tout depuis le serveur. */
  resetDemo: () => void;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initialState);
  const [ready, setReady] = useState(false);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [rechargement, setRechargement] = useState(0);

  const rafraichir = useCallback(() => setRechargement((n) => n + 1), []);

  // Panier et session : restaurés depuis le navigateur, avant tout appel réseau, pour
  // qu'un panier reste visible même si l'API tarde.
  useEffect(() => {
    try {
      const brut = window.localStorage.getItem(STORAGE_KEY);
      if (brut) {
        const persiste = JSON.parse(brut) as Partial<EtatPersiste>;
        setState((s) => ({ ...s, cart: persiste.cart ?? s.cart }));
      }
    } catch {
      /* panier illisible : on repart d'un panier vide plutôt que de bloquer le site */
    }
  }, []);

  useEffect(() => {
    const persiste: EtatPersiste = { cart: state.cart };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persiste));
    } catch {
      /* quota indisponible */
    }
  }, [state.cart]);

  // Chargement du catalogue depuis l'API. Volontairement côté client : le rendu serveur
  // n'a pas d'adresse d'API à interroger, et les données publiques n'ont pas besoin
  // d'être dans le HTML initial à ce stade.
  useEffect(() => {
    const controleur = new AbortController();

    void (async () => {
      try {
        const [catalogue, categories, content, regions, utilisateur] = await Promise.all([
          // Le catalogue entier est chargé pour les écrans qui filtrent encore côté
          // client (accueil, back-office). La boutique, elle, interroge l'API page par
          // page. Au-delà de quelques dizaines de produits, ces écrans devront suivre.
          api.produits({ parPage: 48 }, controleur.signal),
          api.categories(controleur.signal),
          api.contenu(controleur.signal),
          api.livraison(controleur.signal),
          // La session est relue au serveur : le navigateur ne décide pas qui il est.
          api.moi(controleur.signal).catch(() => null),
        ]);
        setState((s) => ({
          ...s,
          products: catalogue.items,
          categories,
          regions,
          // Complété par les valeurs de départ : si l'API répond avec une version
          // antérieure — cache pas encore périmé, déploiement en cours — les champs
          // manquants ne doivent pas faire échouer l'affichage.
          content: { ...s.content, ...content },
          user: utilisateur,
        }));

        // Commandes et promotions ne concernent que le back-office : les charger pour
        // tout le monde exposerait des données de gestion à chaque visiteur.
        if (utilisateur?.isAdmin) {
          const [commandes, promos] = await Promise.all([
            api.commandesAdmin(undefined, controleur.signal),
            api.promosAdmin(controleur.signal),
          ]);
          setState((s) => ({ ...s, orders: commandes, promos }));
        }
        setErreurChargement(null);
      } catch (erreur) {
        if (controleur.signal.aborted) return;
        setErreurChargement(
          erreur instanceof Error ? erreur.message : "La boutique est momentanément indisponible.",
        );
      } finally {
        if (!controleur.signal.aborted) setReady(true);
      }
    })();

    return () => controleur.abort();
  }, [rechargement]);

  const patch = useCallback((fn: (s: State) => State) => setState((s) => fn(s)), []);

  const value = useMemo<StoreValue>(() => {
    const cartSubtotal = state.cart.reduce((sum, line) => {
      const p = state.products.find((x) => x.id === line.productId);
      return sum + (p ? p.price * line.quantity : 0);
    }, 0);

    return {
      ...state,
      ready,
      erreurChargement,
      rafraichir,
      cartCount: state.cart.reduce((n, l) => n + l.quantity, 0),
      cartSubtotal,
      addToCart: (productId, quantity = 1) =>
        patch((s) => {
          const existing = s.cart.find((l) => l.productId === productId);
          return {
            ...s,
            cart: existing
              ? s.cart.map((l) =>
                  l.productId === productId ? { ...l, quantity: l.quantity + quantity } : l,
                )
              : [...s.cart, { productId, quantity }],
          };
        }),
      setCartQuantity: (productId, quantity) =>
        patch((s) => ({
          ...s,
          cart:
            quantity <= 0
              ? s.cart.filter((l) => l.productId !== productId)
              : s.cart.map((l) => (l.productId === productId ? { ...l, quantity } : l)),
        })),
      removeFromCart: (productId) =>
        patch((s) => ({ ...s, cart: s.cart.filter((l) => l.productId !== productId) })),
      clearCart: () => patch((s) => ({ ...s, cart: [] })),
      signIn: async (email, motDePasse) => {
        await api.connecter(email, motDePasse);
        // On relit la session plutôt que de croire le formulaire : le rôle admin
        // vient du serveur, jamais de ce que le navigateur a saisi.
        const utilisateur = await api.moi();
        patch((s) => ({ ...s, user: utilisateur }));
      },
      inscrire: async (nom, email, motDePasse) => {
        await api.inscrire(nom, email, motDePasse);
        const utilisateur = await api.moi();
        patch((s) => ({ ...s, user: utilisateur }));
      },
      signOut: async () => {
        await api.deconnecter().catch(() => undefined);
        patch((s) => ({ ...s, user: null }));
      },
      validatePromo: (code, subtotal) => {
        const promo = state.promos.find((p) => p.code.toUpperCase() === code.trim().toUpperCase());
        if (!promo) return { error: "Ce code promo n'existe pas." };
        if (!promo.active) return { error: "Ce code promo n'est plus actif." };
        const now = Date.now();
        if (now < new Date(promo.startsAt).getTime())
          return { error: "Ce code n'est pas encore valable." };
        if (now > new Date(promo.endsAt).getTime()) return { error: "Ce code a expiré." };
        if (promo.uses >= promo.maxUses)
          return { error: "Ce code a atteint sa limite d'utilisation." };
        if (subtotal < promo.minAmount)
          return {
            error: `Ce code s'applique à partir de ${promo.minAmount.toLocaleString("fr-FR")} FCFA d'achat.`,
          };
        const discount =
          promo.type === "percent"
            ? Math.round((subtotal * promo.value) / 100)
            : Math.min(promo.value, subtotal);
        return { promo, discount };
      },
      placeOrder: async (demande) => {
        const commande = await api.creerCommande(demande);
        // Le panier n'est vidé qu'après confirmation du serveur : en cas de stock
        // insuffisant ou de coupure réseau, le client retrouve ses articles.
        patch((s) => ({
          ...s,
          orders: [commande, ...s.orders],
          cart: [],
          // Les stocks ont changé : on les reflète sans attendre un rechargement.
          products: s.products.map((p) => {
            const ligne = commande.items.find((i) => i.productId === p.id);
            return ligne ? { ...p, stock: Math.max(0, p.stock - ligne.quantity) } : p;
          }),
        }));
        return commande;
      },
      updateOrder: async (id, orderPatch) => {
        const commande = await api.majCommande(id, {
          ...(orderPatch.paid !== undefined ? { paid: orderPatch.paid } : {}),
          ...(orderPatch.internalNote !== undefined
            ? { internalNote: orderPatch.internalNote ?? null }
            : {}),
          ...(orderPatch.status ? { status: orderPatch.status } : {}),
        });
        patch((s) => ({
          ...s,
          orders: s.orders.map((o) => (o.id === id ? { ...o, ...commande } : o)),
        }));
      },

      setOrderStatus: async (id, status) => {
        await api.majCommande(id, { status });
        // Le stock a pu bouger dans les deux sens : on relit plutôt que de deviner.
        const [commandes, catalogue] = await Promise.all([
          api.commandesAdmin(),
          api.produits({ parPage: 48 }),
        ]);
        patch((s) => ({ ...s, orders: commandes, products: catalogue.items }));
      },

      saveProduct: async (product) => {
        const entree = {
          name: product.name,
          categoryId: product.categoryId,
          price: product.price,
          oldPrice: product.oldPrice ?? null,
          stock: product.stock,
          lowStockThreshold: product.lowStockThreshold,
          description: product.description,
          featured: product.featured,
          images: product.images,
        };
        // Un identifiant absent des produits chargés signale une création.
        const existe = state.products.some((p) => p.id === product.id);
        const enregistre = existe
          ? await api.majProduit(product.id, entree)
          : await api.creerProduit(entree);

        patch((s) => ({
          ...s,
          products: existe
            ? s.products.map((p) => (p.id === product.id ? enregistre : p))
            : [enregistre, ...s.products],
        }));
      },

      deleteProduct: async (id) => {
        await api.supprimerProduit(id);
        patch((s) => ({ ...s, products: s.products.filter((p) => p.id !== id) }));
      },

      saveCategory: async (category) => {
        const entree = { name: category.name, description: category.description };
        const existe = state.categories.some((c) => c.id === category.id);
        const enregistree = existe
          ? await api.majCategorie(category.id, entree)
          : await api.creerCategorie(entree);

        patch((s) => ({
          ...s,
          categories: existe
            ? s.categories.map((c) => (c.id === category.id ? enregistree : c))
            : [...s.categories, enregistree],
        }));
      },

      deleteCategory: async (id) => {
        await api.supprimerCategorie(id);
        patch((s) => ({ ...s, categories: s.categories.filter((c) => c.id !== id) }));
      },

      savePromo: async (promo) => {
        const entree = {
          code: promo.code,
          type: promo.type,
          value: promo.value,
          minAmount: promo.minAmount,
          startsAt: promo.startsAt,
          endsAt: promo.endsAt,
          maxUses: promo.maxUses,
          active: promo.active,
        };
        const existe = state.promos.some((p) => p.id === promo.id);
        const enregistre = existe
          ? await api.majPromo(promo.id, entree)
          : await api.creerPromo(entree);

        patch((s) => ({
          ...s,
          promos: existe
            ? s.promos.map((p) => (p.id === promo.id ? enregistre : p))
            : [...s.promos, enregistre],
        }));
      },

      deletePromo: async (id) => {
        await api.supprimerPromo(id);
        patch((s) => ({ ...s, promos: s.promos.filter((p) => p.id !== id) }));
      },

      setRegions: async (regions) => {
        const enregistrees = await api.majLivraison(regions);
        patch((s) => ({ ...s, regions: enregistrees }));
      },

      setContent: async (content) => {
        const enregistre = await api.majContenu(content);
        patch((s) => ({ ...s, content: enregistre }));
      },

      resetDemo: () => {
        setState((s) => ({ ...initialState, cart: s.cart, user: s.user }));
        rafraichir();
      },
    };
  }, [state, ready, erreurChargement, rafraichir, patch]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore doit être utilisé dans un StoreProvider");
  return ctx;
}

export function newId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`;
}

export function orderNumber(): string {
  const d = new Date();
  return `DR-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}-${Math.floor(
    1000 + Math.random() * 9000,
  )}`;
}

export const statusLabels: Record<OrderStatus, string> = {
  en_attente: "En attente",
  confirmee: "Confirmée",
  preparation: "En préparation",
  en_livraison: "En livraison",
  livree: "Livrée",
  non_honoree: "Non honorée",
  annulee: "Annulée",
};

export const statusOrder: OrderStatus[] = [
  "en_attente",
  "confirmee",
  "preparation",
  "en_livraison",
  "livree",
];
