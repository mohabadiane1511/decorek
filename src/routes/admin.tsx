import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  FileText,
  LayoutGrid,
  MapPin,
  Package,
  Ticket,
  Truck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WhatsAppButton } from "@/components/layout/WhatsAppButton";
import { formatDate, formatFcfa } from "@/lib/format";
import { api } from "@/lib/api";
import { newId, statusLabels, useStore } from "@/lib/store";
import type { Category, DeliveryRegion, OrderStatus, Product, PromoCode } from "@/data/types";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Back-office | Deco'Rek" },
      {
        name: "description",
        content: "Gestion des produits, stocks, commandes et promotions Deco'Rek.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Back-office Deco'Rek" },
      { property: "og:description", content: "Espace de gestion réservé à l'équipe." },
    ],
  }),
  component: Admin,
});

const TABS = [
  { id: "dashboard", label: "Tableau de bord", icon: BarChart3 },
  { id: "orders", label: "Commandes", icon: Truck },
  { id: "products", label: "Produits", icon: Package },
  { id: "stock", label: "Stocks", icon: Boxes },
  { id: "categories", label: "Catégories", icon: LayoutGrid },
  { id: "delivery", label: "Livraisons", icon: MapPin },
  { id: "promos", label: "Promotions", icon: Ticket },
  { id: "content", label: "Contenu", icon: FileText },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Exécute une écriture et signale son échec.
 *
 * Les mutations passent désormais par le serveur : elles peuvent être refusées — un
 * produit encore vendu, une catégorie non vide, une session expirée. Sans ce garde-fou,
 * l'échec resterait invisible et l'écran donnerait l'illusion d'avoir enregistré.
 */
async function enregistrer(action: () => Promise<void>, succes: string): Promise<void> {
  try {
    await action();
    toast.success(succes);
  } catch (erreur) {
    toast.error(erreur instanceof Error ? erreur.message : "Enregistrement impossible.");
  }
}

function Admin() {
  const store = useStore();
  const [tab, setTab] = useState<TabId>("dashboard");

  if (!store.user) return <AdminLogin />;
  // Connecté mais sans le rôle : le dire franchement plutôt que de redemander des
  // identifiants, ce qui laisserait croire à une faute de frappe.
  if (!store.user.isAdmin) return <AccesRefuse />;

  return (
    <div className="min-h-screen bg-sand">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="font-display text-lg tracking-tight">Deco'Rek — Back-office</p>
            <p className="text-xs text-muted-foreground">Données de démonstration</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => {
                store.resetDemo();
                toast.success("Données de démo réinitialisées");
              }}
              className="label-mono border border-border px-4 py-2 transition-colors hover:bg-muted"
            >
              Réinitialiser
            </button>
            <Link
              to="/"
              className="label-mono border border-border px-4 py-2 transition-colors hover:bg-muted"
            >
              Voir le site
            </Link>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-2 px-4 py-2 text-sm transition-colors ${
                tab === t.id ? "bg-foreground text-background" : "hover:bg-muted"
              }`}
            >
              <t.icon className="h-4 w-4" strokeWidth={1.5} />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {tab === "dashboard" && <Dashboard />}
        {tab === "orders" && <Orders />}
        {tab === "products" && <Products />}
        {tab === "stock" && <Stock />}
        {tab === "categories" && <Categories />}
        {tab === "delivery" && <Delivery />}
        {tab === "promos" && <Promos />}
        {tab === "content" && <ContentTab />}
      </main>
      <WhatsAppButton />
    </div>
  );
}

function Card({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="border border-border bg-background p-5">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{title}</p>
      <p className="mt-2 title-lg">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Dashboard() {
  const { orders, products } = useStore();
  const [days, setDays] = useState(30);

  const since = Date.now() - days * 86400000;
  const inRange = orders.filter((o) => new Date(o.createdAt).getTime() >= since);
  const valid = inRange.filter((o) => o.status !== "annulee" && o.status !== "non_honoree");
  const revenue = valid.reduce((s, o) => s + o.total, 0);
  const cashed = inRange.filter((o) => o.paid).reduce((s, o) => s + o.total, 0);
  const lowStock = products.filter((p) => p.stock <= p.lowStockThreshold);

  const best = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; total: number }>();
    valid.forEach((o) =>
      o.items.forEach((i) => {
        const cur = map.get(i.productId) ?? { name: i.name, qty: 0, total: 0 };
        cur.qty += i.quantity;
        cur.total += i.price * i.quantity;
        map.set(i.productId, cur);
      }),
    );
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [valid]);

  const series = useMemo(() => {
    const buckets = new Map<string, number>();
    valid.forEach((o) => {
      const key = o.createdAt.slice(0, 10);
      buckets.set(key, (buckets.get(key) ?? 0) + o.total);
    });
    return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [valid]);
  const max = Math.max(1, ...series.map((s) => s[1]));

  return (
    <div className="space-y-8">
      <div className="flex gap-2">
        {[7, 30, 90, 365].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`label-mono border px-3 py-2 ${days === d ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:bg-muted"}`}
          >
            {d === 365 ? "1 an" : `${d} j`}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Chiffre d'affaires" value={formatFcfa(revenue)} hint="Commandes valides" />
        <Card title="Encaissé" value={formatFcfa(cashed)} hint="Confirmé à la livraison" />
        <Card title="Commandes" value={String(inRange.length)} hint={`${valid.length} valides`} />
        <Card title="Stock bas" value={String(lowStock.length)} hint="Articles à réassortir" />
      </div>

      <section className="border border-border bg-background p-6">
        <h2 className="font-display text-lg tracking-tight">Évolution du chiffre d'affaires</h2>
        {series.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Aucune commande sur la période.</p>
        ) : (
          <div className="mt-6 flex h-44 items-end gap-2">
            {series.map(([date, value]) => (
              <div key={date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div
                  className="w-full bg-foreground"
                  style={{ height: `${Math.max(4, (value / max) * 140)}px` }}
                  title={`${date} — ${formatFcfa(value)}`}
                />
                <span className="truncate text-[10px] text-muted-foreground">
                  {date.slice(8)}/{date.slice(5, 7)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="border border-border bg-background p-6">
          <h2 className="font-display text-lg tracking-tight">Meilleures ventes</h2>
          <ul className="mt-4 divide-y divide-border">
            {best.length === 0 && <li className="py-3 text-sm text-muted-foreground">—</li>}
            {best.map((b) => (
              <li key={b.name} className="flex justify-between gap-3 py-3 text-sm">
                <span className="min-w-0 truncate">{b.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {b.qty} vendus · {formatFcfa(b.total)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border border-border bg-background p-6">
          <h2 className="flex items-center gap-2 font-display text-lg tracking-tight">
            <AlertTriangle className="h-4 w-4 text-orange-brand" strokeWidth={1.5} /> Alertes stock
          </h2>
          <ul className="mt-4 divide-y divide-border">
            {lowStock.length === 0 && (
              <li className="py-3 text-sm text-muted-foreground">Tous les stocks sont bons.</li>
            )}
            {lowStock.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-3 text-sm">
                <span className="min-w-0 truncate">{p.name}</span>
                <span className={p.stock === 0 ? "text-destructive" : "text-orange-brand"}>
                  {p.stock} en stock
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

const STATUSES: OrderStatus[] = [
  "en_attente",
  "confirmee",
  "preparation",
  "en_livraison",
  "livree",
  "non_honoree",
  "annulee",
];

function Orders() {
  const { orders, setOrderStatus, updateOrder } = useStore();
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const list = orders.filter((o) => filter === "all" || o.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`label-mono border px-3 py-2 ${filter === "all" ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:bg-muted"}`}
        >
          Toutes
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`label-mono border px-3 py-2 ${filter === s ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:bg-muted"}`}
          >
            {statusLabels[s]}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {list.length === 0 && <p className="text-sm text-muted-foreground">Aucune commande.</p>}
        {list.map((o) => (
          <article key={o.id} className="border border-border bg-background p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h3 className="font-mono text-sm tracking-wider">{o.number}</h3>
                <p className="text-sm text-muted-foreground">
                  {o.customer.name} · {o.customer.phone} · {formatDate(o.createdAt)}
                </p>
              </div>
              <p className="text-lg">{formatFcfa(o.total)}</p>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              {o.delivery.areaName}, {o.delivery.regionName} — {o.delivery.address} (
              {formatFcfa(o.delivery.fee)})
              {o.promoCode && ` · code ${o.promoCode} (-${formatFcfa(o.discount)})`}
            </p>

            <ul className="mt-3 space-y-2 text-sm">
              {o.items.map((i) => (
                <li key={i.productId} className="flex items-center gap-3 text-muted-foreground">
                  {i.image ? (
                    <img
                      src={i.image}
                      alt={i.name}
                      loading="lazy"
                      className="h-12 w-12 shrink-0 border border-border object-cover"
                    />
                  ) : (
                    <span className="h-12 w-12 shrink-0 border border-border bg-muted" />
                  )}
                  <span className="min-w-0 truncate">
                    {i.quantity} × {i.name}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <select
                value={o.status}
                onChange={(e) =>
                  void enregistrer(
                    () => setOrderStatus(o.id, e.target.value as OrderStatus),
                    "Statut mis à jour",
                  )
                }
                className="h-9 border border-input bg-background px-3 text-sm"
                aria-label="Statut"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabels[s]}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={o.paid}
                  onChange={(e) =>
                    void enregistrer(
                      () => updateOrder(o.id, { paid: e.target.checked }),
                      "Encaissement enregistré",
                    )
                  }
                />
                Encaissement confirmé
              </label>
              <Input
                defaultValue={o.internalNote ?? ""}
                placeholder="Note interne"
                onBlur={(e) =>
                  void enregistrer(
                    () => updateOrder(o.id, { internalNote: e.target.value }),
                    "Note enregistrée",
                  )
                }
                className="h-9 max-w-xs rounded-none"
              />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const emptyProduct = (): Product => ({
  id: newId("p"),
  slug: "",
  name: "",
  categoryId: "",
  price: 0,
  stock: 0,
  lowStockThreshold: 3,
  description: "",
  images: [],
  featured: false,
  createdAt: new Date().toISOString(),
});

function Products() {
  const { products, categories, saveProduct, deleteProduct } = useStore();
  const [envoiImages, setEnvoiImages] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [draft, setDraft] = useState<Product | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.categoryId) {
      toast.error("Nom et catégorie obligatoires.");
      return;
    }
    // La base refuse un prix barré inférieur ou égal au prix de vente : autant le dire
    // ici plutôt que de laisser partir une requête vouée à l'échec.
    if (draft.oldPrice !== undefined && draft.oldPrice <= draft.price) {
      toast.error("Le prix barré doit être supérieur au prix de vente.");
      return;
    }
    void enregistrer(
      () => saveProduct({ ...draft, slug: slugify(draft.name) }),
      "Produit enregistré",
    );

    setDraft(null);
  };

  return (
    <div className="space-y-6">
      <button
        onClick={() => setDraft({ ...emptyProduct(), categoryId: categories[0]?.id ?? "" })}
        className="btn-square btn-solid"
      >
        Nouveau produit
      </button>

      {draft && (
        <div className="grid gap-4 border border-border bg-background p-6 sm:grid-cols-2">
          <div>
            <Label>Nom</Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="mt-1.5 rounded-none"
            />
          </div>
          <div>
            <Label>Catégorie</Label>
            <select
              value={draft.categoryId}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
              className="mt-1.5 h-9 w-full border border-input bg-background px-3 text-sm"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="prix">Prix (FCFA)</Label>
            <Input
              id="prix"
              type="number"
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
              className="mt-1.5 rounded-none"
            />
          </div>
          <div>
            <Label htmlFor="prix-barre">Prix barré (facultatif)</Label>
            <Input
              id="prix-barre"
              type="number"
              placeholder="Laisser vide si pas de promotion"
              value={draft.oldPrice ?? ""}
              onChange={(e) => {
                const saisie = e.target.value.trim();
                // Champ vidé : on retire la promotion plutôt que d'enregistrer un zéro,
                // qui serait refusé par la règle « prix barré supérieur au prix ».
                setDraft({
                  ...draft,
                  ...(saisie === "" ? { oldPrice: undefined } : { oldPrice: Number(saisie) }),
                });
              }}
              className="mt-1.5 rounded-none"
            />
            {draft.oldPrice !== undefined && draft.oldPrice <= draft.price ? (
              <p className="mt-1.5 text-xs text-destructive">
                Le prix barré doit être supérieur au prix de vente, sinon la promotion annoncerait
                une hausse.
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Renseigné, il affiche le badge « Promo » et barre l'ancien prix en boutique.
              </p>
            )}
          </div>
          <div>
            <Label>Stock</Label>
            <Input
              type="number"
              value={draft.stock}
              onChange={(e) => setDraft({ ...draft, stock: Number(e.target.value) })}
              className="mt-1.5 rounded-none"
            />
          </div>
          <div>
            <Label>Seuil d'alerte stock</Label>
            <Input
              type="number"
              value={draft.lowStockThreshold}
              onChange={(e) => setDraft({ ...draft, lowStockThreshold: Number(e.target.value) })}
              className="mt-1.5 rounded-none"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Images du produit</Label>
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={async (e) => {
                const fichiers = Array.from(e.target.files ?? []);
                if (!fichiers.length) return;
                e.target.value = "";

                // Envoi direct au stockage, une image à la fois pour ne pas saturer
                // une connexion mobile. L'encodage en base64 précédent gonflait la
                // page d'un tiers et ne survivait pas au rechargement.
                setEnvoiImages(true);
                try {
                  for (const fichier of fichiers) {
                    const chemin = await api.televerserImage(fichier);
                    setDraft((d) => ({ ...d!, images: [...d!.images, chemin] }));
                  }
                } catch (erreur) {
                  toast.error(
                    erreur instanceof Error ? erreur.message : "Téléversement impossible.",
                  );
                } finally {
                  setEnvoiImages(false);
                }
              }}
              disabled={envoiImages}
              className="mt-1.5 rounded-none"
            />
            {draft.images.length > 0 && (
              <>
                <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  Glissez pour réorganiser — la 1re image est la couverture
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {draft.images.map((src, i) => (
                    <div
                      key={`${i}-${src.slice(-16)}`}
                      draggable
                      onDragStart={() => setDragIndex(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragIndex === null || dragIndex === i) return;
                        setDraft((d) => {
                          const images = [...d!.images];
                          const [moved] = images.splice(dragIndex, 1);
                          images.splice(i, 0, moved!);
                          return { ...d!, images };
                        });
                        setDragIndex(null);
                      }}
                      onDragEnd={() => setDragIndex(null)}
                      className={`relative cursor-grab active:cursor-grabbing ${dragIndex === i ? "opacity-40" : ""}`}
                    >
                      <img
                        src={src}
                        alt=""
                        className={`h-16 w-16 object-cover ${i === 0 ? "border-2 border-foreground" : "border border-border"}`}
                      />
                      {i === 0 && (
                        <span className="absolute inset-x-0 bottom-0 bg-foreground/85 py-0.5 text-center font-mono text-[9px] uppercase tracking-wider text-background">
                          Couverture
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({ ...d!, images: d!.images.filter((_, j) => j !== i) }))
                        }
                        className="absolute -right-2 -top-2 h-5 w-5 border border-border bg-background text-xs leading-none"
                        aria-label="Retirer l'image"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="sm:col-span-2">
            <Label>Description</Label>
            <Textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={3}
              className="mt-1.5 rounded-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.featured}
              onChange={(e) => setDraft({ ...draft, featured: e.target.checked })}
            />
            Mettre en avant sur l'accueil
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button onClick={save} className="btn-square btn-solid">
              Enregistrer
            </button>
            <button onClick={() => setDraft(null)} className="btn-square btn-outline border-border">
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b border-border label-mono text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Produit</th>
              <th className="px-4 py-3">Catégorie</th>
              <th className="px-4 py-3">Prix</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {p.images[0] && (
                      <img src={p.images[0]} alt="" className="h-10 w-10 object-cover" />
                    )}
                    <span>{p.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {categories.find((c) => c.id === p.categoryId)?.name ?? "—"}
                </td>
                <td className="px-4 py-3">{formatFcfa(p.price)}</td>
                <td className="px-4 py-3">{p.stock}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setDraft(p)} className="mr-3 underline">
                    Modifier
                  </button>
                  <button
                    onClick={() => {
                      void enregistrer(() => deleteProduct(p.id), "Produit supprimé");
                    }}
                    className="text-destructive underline"
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stock() {
  const { products, saveProduct } = useStore();
  const sorted = [...products].sort((a, b) => a.stock - b.stock);
  return (
    <div className="overflow-x-auto border border-border bg-background">
      <table className="w-full text-sm">
        <thead className="border-b border-border label-mono text-left text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Produit</th>
            <th className="px-4 py-3">Stock</th>
            <th className="px-4 py-3">Seuil</th>
            <th className="px-4 py-3">État</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3">{p.name}</td>
              <td className="px-4 py-3">
                <Input
                  type="number"
                  value={p.stock}
                  onChange={(e) =>
                    void enregistrer(
                      () => saveProduct({ ...p, stock: Number(e.target.value) }),
                      "Stock mis à jour",
                    )
                  }
                  className="h-9 w-24 rounded-none"
                />
              </td>
              <td className="px-4 py-3">
                <Input
                  type="number"
                  value={p.lowStockThreshold}
                  onChange={(e) =>
                    void enregistrer(
                      () => saveProduct({ ...p, lowStockThreshold: Number(e.target.value) }),
                      "Seuil mis à jour",
                    )
                  }
                  className="h-9 w-24 rounded-none"
                />
              </td>
              <td className="px-4 py-3">
                {p.stock === 0 ? (
                  <span className="text-destructive">Épuisé</span>
                ) : p.stock <= p.lowStockThreshold ? (
                  <span className="text-orange-brand">Stock bas</span>
                ) : (
                  <span className="text-muted-foreground">OK</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Categories() {
  const { categories, saveCategory, deleteCategory } = useStore();
  const [draft, setDraft] = useState<Category | null>(null);
  return (
    <div className="space-y-6">
      <button
        onClick={() => setDraft({ id: newId("c"), slug: "", name: "", description: "" })}
        className="btn-square btn-solid"
      >
        Nouvelle catégorie
      </button>
      {draft && (
        <div className="grid gap-4 border border-border bg-background p-6 sm:grid-cols-2">
          <div>
            <Label>Nom</Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="mt-1.5 rounded-none"
            />
          </div>
          <div>
            <Label>Slug (généré automatiquement)</Label>
            <Input
              value={slugify(draft.name)}
              readOnly
              disabled
              className="mt-1.5 rounded-none bg-muted"
            />
          </div>

          <div className="sm:col-span-2">
            <Label>Description</Label>
            <Textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={2}
              className="mt-1.5 rounded-none"
            />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button
              onClick={() => {
                const slug = slugify(draft.name);
                if (!draft.name.trim() || !slug) {
                  toast.error("Nom obligatoire.");
                  return;
                }
                void enregistrer(() => saveCategory({ ...draft, slug }), "Catégorie enregistrée");

                setDraft(null);
              }}
              className="btn-square btn-solid"
            >
              Enregistrer
            </button>
            <button onClick={() => setDraft(null)} className="btn-square btn-outline border-border">
              Annuler
            </button>
          </div>
        </div>
      )}
      <ul className="divide-y divide-border border border-border bg-background">
        {categories.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
          >
            <div>
              <p>{c.name}</p>
              <p className="text-xs text-muted-foreground">/{c.slug}</p>
            </div>
            <div className="whitespace-nowrap">
              <button onClick={() => setDraft(c)} className="mr-3 underline">
                Modifier
              </button>
              <button
                onClick={() => void enregistrer(() => deleteCategory(c.id), "Catégorie supprimée")}
                className="text-destructive underline"
              >
                Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Promos() {
  const { promos, savePromo, deletePromo } = useStore();
  const [draft, setDraft] = useState<PromoCode | null>(null);
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Les codes promo sont utilisables uniquement par les clients connectés.
      </p>
      <button
        onClick={() =>
          setDraft({
            id: newId("pr"),
            code: "",
            type: "percent",
            value: 10,
            minAmount: 0,
            startsAt: new Date().toISOString().slice(0, 10),
            endsAt: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
            maxUses: 100,
            uses: 0,
            active: true,
          })
        }
        className="btn-square btn-solid"
      >
        Nouveau code promo
      </button>

      {draft && (
        <div className="grid gap-4 border border-border bg-background p-6 sm:grid-cols-3">
          <div>
            <Label>Code</Label>
            <Input
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
              className="mt-1.5 rounded-none"
            />
          </div>
          <div>
            <Label>Type</Label>
            <select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as PromoCode["type"] })}
              className="mt-1.5 h-9 w-full border border-input bg-background px-3 text-sm"
            >
              <option value="percent">Pourcentage</option>
              <option value="amount">Montant fixe</option>
            </select>
          </div>
          <div>
            <Label>Valeur</Label>
            <Input
              type="number"
              value={draft.value}
              onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })}
              className="mt-1.5 rounded-none"
            />
          </div>
          <div>
            <Label>Montant minimum</Label>
            <Input
              type="number"
              value={draft.minAmount}
              onChange={(e) => setDraft({ ...draft, minAmount: Number(e.target.value) })}
              className="mt-1.5 rounded-none"
            />
          </div>
          <div>
            <Label>Début</Label>
            <Input
              type="date"
              value={draft.startsAt.slice(0, 10)}
              onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
              className="mt-1.5 rounded-none"
            />
          </div>
          <div>
            <Label>Fin</Label>
            <Input
              type="date"
              value={draft.endsAt.slice(0, 10)}
              onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })}
              className="mt-1.5 rounded-none"
            />
          </div>
          <div>
            <Label>Utilisations max</Label>
            <Input
              type="number"
              value={draft.maxUses}
              onChange={(e) => setDraft({ ...draft, maxUses: Number(e.target.value) })}
              className="mt-1.5 rounded-none"
            />
          </div>
          <label className="mt-6 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />
            Actif
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <button
              onClick={() => {
                if (!draft.code.trim()) {
                  toast.error("Le code est obligatoire.");
                  return;
                }
                void enregistrer(() => savePromo(draft), "Code promo enregistré");
                setDraft(null);
              }}
              className="btn-square btn-solid"
            >
              Enregistrer
            </button>
            <button onClick={() => setDraft(null)} className="btn-square btn-outline border-border">
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b border-border label-mono text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Remise</th>
              <th className="px-4 py-3">Validité</th>
              <th className="px-4 py-3">Utilisations</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {promos.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  {p.code} {!p.active && <span className="text-muted-foreground">(inactif)</span>}
                </td>
                <td className="px-4 py-3">
                  {p.type === "percent" ? `${p.value}%` : formatFcfa(p.value)}
                  {p.minAmount > 0 && (
                    <span className="text-muted-foreground"> · dès {formatFcfa(p.minAmount)}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {p.startsAt.slice(0, 10)} → {p.endsAt.slice(0, 10)}
                </td>
                <td className="px-4 py-3">
                  {p.uses}/{p.maxUses}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setDraft(p)} className="mr-3 underline">
                    Modifier
                  </button>
                  <button
                    onClick={() => void enregistrer(() => deletePromo(p.id), "Code supprimé")}
                    className="text-destructive underline"
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContentTab() {
  const { content, setContent, regions, setRegions } = useStore();
  const [draft, setDraft] = useState(content);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 border border-border bg-background p-6 sm:grid-cols-2">
        <h2 className="font-display text-xl sm:col-span-2">Bannière & coordonnées</h2>
        <div>
          <Label htmlFor="banniere-titre">Titre bannière</Label>
          <Input
            id="banniere-titre"
            value={draft.bannerTitle}
            onChange={(e) => setDraft({ ...draft, bannerTitle: e.target.value })}
            className="mt-1.5 rounded-none"
          />
        </div>
        <div>
          <Label>Bouton bannière</Label>
          <Input
            value={draft.bannerCta}
            onChange={(e) => setDraft({ ...draft, bannerCta: e.target.value })}
            className="mt-1.5 rounded-none"
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Sous-titre</Label>
          <Textarea
            value={draft.bannerSubtitle}
            onChange={(e) => setDraft({ ...draft, bannerSubtitle: e.target.value })}
            rows={2}
            className="mt-1.5 rounded-none"
          />
        </div>
        <div>
          <Label>WhatsApp (indicatif inclus)</Label>
          <Input
            value={draft.whatsapp}
            onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })}
            className="mt-1.5 rounded-none"
          />
        </div>
        <div>
          <Label>Téléphone</Label>
          <Input
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            className="mt-1.5 rounded-none"
          />
        </div>
        <div>
          <Label>Email</Label>
          <Input
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            className="mt-1.5 rounded-none"
          />
        </div>
        <div>
          <Label>Adresse</Label>
          <Input
            value={draft.address}
            onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            className="mt-1.5 rounded-none"
          />
        </div>
        <div>
          <Label>Livraison offerte à partir de (FCFA)</Label>
          <Input
            type="number"
            value={draft.freeShippingFrom}
            onChange={(e) => setDraft({ ...draft, freeShippingFrom: Number(e.target.value) })}
            className="mt-1.5 rounded-none"
          />
        </div>
      </section>

      <section className="grid gap-4 border border-border bg-background p-6">
        <h2 className="font-display text-lg tracking-tight">Pages éditoriales</h2>
        {(["contact", "livraison", "apropos", "cgv"] as const).map((key) => (
          <div key={key}>
            <Label className="capitalize">{key}</Label>
            <Textarea
              value={draft.pages[key]}
              onChange={(e) =>
                setDraft({ ...draft, pages: { ...draft.pages, [key]: e.target.value } })
              }
              rows={4}
              className="mt-1.5 rounded-none"
            />
          </div>
        ))}
      </section>

      <button
        onClick={() => {
          void enregistrer(() => setContent(draft), "Contenu du site mis à jour");
        }}
        className="bg-primary px-6 py-3 text-sm text-primary-foreground"
      >
        Enregistrer le contenu
      </button>
    </div>
  );
}

function Delivery() {
  const { regions, setRegions } = useStore();
  const [newRegion, setNewRegion] = useState("");
  const [areaDraft, setAreaDraft] = useState<Record<string, { name: string; fee: string }>>({});

  const update = (regionId: string, fn: (r: DeliveryRegion) => DeliveryRegion) =>
    void enregistrer(
      () => setRegions(regions.map((r) => (r.id === regionId ? fn(r) : r))),
      "Zones enregistrées",
    );

  return (
    <div className="space-y-8">
      <section className="border border-border bg-background p-6">
        <h2 className="font-display text-lg tracking-tight">Ajouter une région</h2>
        <form
          className="mt-4 flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newRegion.trim();
            if (!name) return;
            // L'identifiant local est provisoire : le serveur en attribue un vrai et
            // renvoie la liste, que le store remplace.
            void enregistrer(
              () => setRegions([...regions, { id: newId("reg"), name, areas: [] }]),
              "Région ajoutée",
            );
            setNewRegion("");
          }}
        >
          <Input
            value={newRegion}
            onChange={(e) => setNewRegion(e.target.value)}
            placeholder="Ex. Thiès"
            className="h-10 w-64 rounded-none"
          />
          <button type="submit" className="bg-primary px-5 py-2 text-sm text-primary-foreground">
            Ajouter
          </button>
        </form>
      </section>

      {regions.map((r) => {
        const draft = areaDraft[r.id] ?? { name: "", fee: "" };
        return (
          <section key={r.id} className="border border-border bg-background p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                value={r.name}
                onChange={(e) => update(r.id, (reg) => ({ ...reg, name: e.target.value }))}
                className="h-10 w-64 rounded-none font-medium"
              />
              <button
                onClick={() => {
                  void enregistrer(
                    () => setRegions(regions.filter((reg) => reg.id !== r.id)),
                    "Région supprimée",
                  );
                }}
                className="border border-border px-4 py-2 text-sm transition-colors hover:bg-muted"
              >
                Supprimer la région
              </button>
            </div>

            <div className="mt-5 space-y-2">
              {r.areas.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucun quartier pour cette région.</p>
              )}
              {r.areas.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-2">
                  <Input
                    value={a.name}
                    onChange={(e) =>
                      update(r.id, (reg) => ({
                        ...reg,
                        areas: reg.areas.map((ar) =>
                          ar.id === a.id ? { ...ar, name: e.target.value } : ar,
                        ),
                      }))
                    }
                    className="h-9 w-56 rounded-none"
                  />
                  <Input
                    type="number"
                    value={a.fee}
                    onChange={(e) =>
                      update(r.id, (reg) => ({
                        ...reg,
                        areas: reg.areas.map((ar) =>
                          ar.id === a.id ? { ...ar, fee: Number(e.target.value) } : ar,
                        ),
                      }))
                    }
                    className="h-9 w-32 rounded-none"
                  />
                  <span className="label-mono text-muted-foreground">FCFA</span>
                  <button
                    onClick={() =>
                      update(r.id, (reg) => ({
                        ...reg,
                        areas: reg.areas.filter((ar) => ar.id !== a.id),
                      }))
                    }
                    className="border border-border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
                  >
                    Retirer
                  </button>
                </div>
              ))}
            </div>

            <form
              className="mt-5 flex flex-wrap items-end gap-2 border-t border-border pt-5"
              onSubmit={(e) => {
                e.preventDefault();
                const name = draft.name.trim();
                if (!name) return;
                update(r.id, (reg) => ({
                  ...reg,
                  areas: [...reg.areas, { id: newId("zone"), name, fee: Number(draft.fee) || 0 }],
                }));
                setAreaDraft({ ...areaDraft, [r.id]: { name: "", fee: "" } });
                toast.success("Quartier ajouté");
              }}
            >
              <div>
                <Label className="label-mono">Quartier / ville</Label>
                <Input
                  value={draft.name}
                  onChange={(e) =>
                    setAreaDraft({ ...areaDraft, [r.id]: { ...draft, name: e.target.value } })
                  }
                  placeholder="Ex. Ngor"
                  className="mt-1.5 h-9 w-56 rounded-none"
                />
              </div>
              <div>
                <Label className="label-mono">Frais (FCFA)</Label>
                <Input
                  type="number"
                  value={draft.fee}
                  onChange={(e) =>
                    setAreaDraft({ ...areaDraft, [r.id]: { ...draft, fee: e.target.value } })
                  }
                  placeholder="2000"
                  className="mt-1.5 h-9 w-32 rounded-none"
                />
              </div>
              <button
                type="submit"
                className="bg-primary px-5 py-2 text-sm text-primary-foreground"
              >
                Ajouter le quartier
              </button>
            </form>
          </section>
        );
      })}
    </div>
  );
}

function AccesRefuse() {
  const store = useStore();
  return (
    <div className="grid min-h-screen place-items-center bg-sand px-4">
      <div className="w-full max-w-md border border-border bg-background p-8 text-center">
        <p className="label-mono text-muted-foreground">Deco'Rek — Back-office</p>
        <h1 className="title-lg mt-3">Accès refusé.</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Le compte <span className="font-mono">{store.user?.email}</span> n'a pas les droits
          d'administration. Contactez un responsable pour qu'il vous les accorde.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => void store.signOut()}
            className="label-mono border border-border px-4 py-2 transition-colors hover:bg-muted"
          >
            Se déconnecter
          </button>
          <Link to="/" className="label-mono border border-border px-4 py-2 hover:bg-muted">
            Retour au site
          </Link>
        </div>
      </div>
    </div>
  );
}

function AdminLogin() {
  const store = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [enCours, setEnCours] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setEnCours(true);
    try {
      // Le serveur seul décide qui est administrateur : ce formulaire ne fait
      // qu'ouvrir une session, le rôle est vérifié à chaque requête ensuite.
      await store.signIn(email.trim().toLowerCase(), password);
      toast.success("Connexion réussie");
    } catch (erreur) {
      setError(erreur instanceof Error ? erreur.message : "Identifiants invalides.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-sand px-4">
      <div className="w-full max-w-md border border-border bg-background p-8">
        <p className="label-mono text-muted-foreground">Deco'Rek — Back-office</p>
        <h1 className="title-lg mt-3">Connexion.</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Espace réservé à l'équipe. Accès par identifiants administrateur.
        </p>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label className="label-mono" htmlFor="admin-email">
              Email
            </Label>
            <Input
              id="admin-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@decorek.sn"
              required
            />
          </div>
          <div className="space-y-2">
            <Label className="label-mono" htmlFor="admin-password">
              Mot de passe
            </Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <button type="submit" className="btn-square btn-solid w-full justify-center">
            Se connecter
          </button>
        </form>

        <Link to="/" className="link-underline mt-6 inline-block text-sm text-muted-foreground">
          Retour à la boutique
        </Link>
      </div>
    </div>
  );
}
