import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { seedContent, seedOrders, seedPromos } from "@/data/seed";
import { api } from "@/lib/api";
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

// Catalogue, catégories, zones et contenu viennent désormais de l'API. Commandes et
// promotions restent sur les données de démonstration jusqu'aux lots 12 et 15.
const initialState: State = {
  products: [],
  categories: [],
  orders: seedOrders,
  promos: seedPromos,
  regions: [],
  content: seedContent,
  cart: [],
  user: null,
};

// Seuls le panier et la session sont persistés. Y garder le catalogue produirait
// exactement le défaut rencontré avec les images : un navigateur servant indéfiniment
// de vieilles données en ignorant la source.
const STORAGE_KEY = "decorek-panier-v1";

type EtatPersiste = Pick<State, "cart" | "user">;

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
  signIn: (user: SessionUser) => void;
  signOut: () => void;
  validatePromo: (
    code: string,
    subtotal: number,
  ) => { promo: PromoCode; discount: number } | { error: string };
  placeOrder: (order: Order) => void;
  updateOrder: (id: string, patch: Partial<Order>) => void;
  setOrderStatus: (id: string, status: OrderStatus) => void;
  saveProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
  saveCategory: (category: Category) => void;
  deleteCategory: (id: string) => void;
  savePromo: (promo: PromoCode) => void;
  deletePromo: (id: string) => void;
  setRegions: (regions: DeliveryRegion[]) => void;
  setContent: (content: SiteContent) => void;
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
        setState((s) => ({
          ...s,
          cart: persiste.cart ?? s.cart,
          user: persiste.user ?? s.user,
        }));
      }
    } catch {
      /* panier illisible : on repart d'un panier vide plutôt que de bloquer le site */
    }
  }, []);

  useEffect(() => {
    const persiste: EtatPersiste = { cart: state.cart, user: state.user };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persiste));
    } catch {
      /* quota indisponible */
    }
  }, [state.cart, state.user]);

  // Chargement du catalogue depuis l'API. Volontairement côté client : le rendu serveur
  // n'a pas d'adresse d'API à interroger, et les données publiques n'ont pas besoin
  // d'être dans le HTML initial à ce stade.
  useEffect(() => {
    const controleur = new AbortController();

    void (async () => {
      try {
        const [catalogue, categories, content, regions] = await Promise.all([
          // Le catalogue entier est chargé pour les écrans qui filtrent encore côté
          // client (accueil, back-office). La boutique, elle, interroge l'API page par
          // page. Au-delà de quelques dizaines de produits, ces écrans devront suivre.
          api.produits({ parPage: 48 }, controleur.signal),
          api.categories(controleur.signal),
          api.contenu(controleur.signal),
          api.livraison(controleur.signal),
        ]);
        setState((s) => ({ ...s, products: catalogue.items, categories, content, regions }));
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
      signIn: (user) => patch((s) => ({ ...s, user })),
      signOut: () => patch((s) => ({ ...s, user: null })),
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
      placeOrder: (order) =>
        patch((s) => ({
          ...s,
          orders: [order, ...s.orders],
          cart: [],
          products: s.products.map((p) => {
            const line = order.items.find((i) => i.productId === p.id);
            return line ? { ...p, stock: Math.max(0, p.stock - line.quantity) } : p;
          }),
          promos: s.promos.map((p) =>
            order.promoCode && p.code === order.promoCode ? { ...p, uses: p.uses + 1 } : p,
          ),
        })),
      updateOrder: (id, orderPatch) =>
        patch((s) => ({
          ...s,
          orders: s.orders.map((o) => (o.id === id ? { ...o, ...orderPatch } : o)),
        })),
      setOrderStatus: (id, status) =>
        patch((s) => ({
          ...s,
          orders: s.orders.map((o) => (o.id === id ? { ...o, status } : o)),
          products:
            status === "annulee" || status === "non_honoree"
              ? s.products.map((p) => {
                  const order = s.orders.find((o) => o.id === id);
                  if (!order || order.status === "annulee" || order.status === "non_honoree")
                    return p;
                  const line = order.items.find((i) => i.productId === p.id);
                  return line ? { ...p, stock: p.stock + line.quantity } : p;
                })
              : s.products,
        })),
      saveProduct: (product) =>
        patch((s) => ({
          ...s,
          products: s.products.some((p) => p.id === product.id)
            ? s.products.map((p) => (p.id === product.id ? product : p))
            : [product, ...s.products],
        })),
      deleteProduct: (id) =>
        patch((s) => ({ ...s, products: s.products.filter((p) => p.id !== id) })),
      saveCategory: (category) =>
        patch((s) => ({
          ...s,
          categories: s.categories.some((c) => c.id === category.id)
            ? s.categories.map((c) => (c.id === category.id ? category : c))
            : [...s.categories, category],
        })),
      deleteCategory: (id) =>
        patch((s) => ({ ...s, categories: s.categories.filter((c) => c.id !== id) })),
      savePromo: (promo) =>
        patch((s) => ({
          ...s,
          promos: s.promos.some((p) => p.id === promo.id)
            ? s.promos.map((p) => (p.id === promo.id ? promo : p))
            : [...s.promos, promo],
        })),
      deletePromo: (id) => patch((s) => ({ ...s, promos: s.promos.filter((p) => p.id !== id) })),
      setRegions: (regions) => patch((s) => ({ ...s, regions })),
      setContent: (content) => patch((s) => ({ ...s, content })),
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
