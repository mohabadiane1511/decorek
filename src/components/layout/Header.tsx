import { Link, useNavigate } from "@tanstack/react-router";
import { Heart, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { useRef, useState } from "react";
const logo = "/images/logo-decorek.png";
import { useStore } from "@/lib/store";

const links = [
  { to: "/boutique", label: "Boutique" },

  { to: "/suivi", label: "Suivi" },
  { to: "/contact", label: "Contact" },
] as const;

export function Header() {
  const { cartCount, favoris } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [barVisible, setBarVisible] = useState(true);
  const [recherche, setRecherche] = useState(false);
  const [terme, setTerme] = useState("");
  const champ = useRef<HTMLInputElement>(null);

  // La boutique sait déjà chercher : l'en-tête ne fait que l'y emmener avec le terme
  // saisi, plutôt que d'ouvrir un second moteur à tenir en parallèle.
  const lancer = (evenement: React.FormEvent): void => {
    evenement.preventDefault();
    const q = terme.trim();
    if (!q) return;
    setRecherche(false);
    setOpen(false);
    void navigate({ to: "/boutique", search: { q } });
  };

  return (
    <header className="sticky top-0 z-40 bg-background">
      {barVisible && (
        <div className="relative bg-foreground px-10 py-2.5 text-center text-background">
          <span className="label-mono">Paiement à la livraison · Dakar &amp; régions</span>
          <button
            onClick={() => setBarVisible(false)}
            aria-label="Fermer"
            className="absolute top-1/2 right-3 -translate-y-1/2 opacity-70 transition-opacity hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Burger (mobile only) — à gauche */}
          <button
            className="order-1 grid h-10 w-10 shrink-0 place-items-center transition-colors hover:bg-muted md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* Logo — centré sur mobile, à gauche sur desktop */}
          <Link
            to="/"
            className="order-2 flex min-w-0 shrink-0 items-center gap-2 md:order-1"
            onClick={() => setOpen(false)}
          >
            <img
              src={logo}
              alt="Deco'Rek Home & Events"
              className="h-12 w-12 shrink-0 md:h-10 md:w-10"
            />
            <span className="label-mono hidden text-[0.8rem] sm:block">Deco'Rek</span>
          </Link>

          {/* Nav — centré sur desktop */}
          <nav className="order-2 hidden justify-center gap-8 md:flex">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="nav-lien text-foreground/80 transition-colors hover:text-foreground"
                activeProps={{ className: "text-orange-brand border-b border-orange-brand" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Actions — à droite sur mobile et desktop */}
          <div className="order-3 flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setRecherche((v) => !v);
                // Le champ prend le curseur à l'ouverture : sans cela, il faut viser
                // une seconde fois, au doigt, sur un écran de téléphone.
                setTimeout(() => champ.current?.focus(), 0);
              }}
              className="grid h-10 w-10 place-items-center transition-colors hover:bg-muted"
              // Distinct du bouton d'envoi, qui s'appelle « Rechercher » : deux
              // commandes du même nom dans la même zone sont ambiguës à la voix.
              aria-label={recherche ? "Fermer la recherche" : "Ouvrir la recherche"}
              aria-expanded={recherche}
            >
              <Search className="h-5 w-5" strokeWidth={1.4} />
            </button>
            <Link
              to="/compte"
              className="grid h-10 w-10 place-items-center transition-colors hover:bg-muted"
              aria-label="Mon compte"
            >
              <User className="h-5 w-5" strokeWidth={1.4} />
            </Link>
            <Link
              to="/favoris"
              className="relative grid h-10 w-10 place-items-center transition-colors hover:bg-muted"
              aria-label={favoris.length > 0 ? `Favoris (${favoris.length})` : "Favoris"}
            >
              <Heart className="h-5 w-5" strokeWidth={1.4} />
              {favoris.length > 0 && (
                <span className="absolute top-1 right-0.5 grid h-4 min-w-4 place-items-center bg-foreground px-1 font-mono text-[10px] text-background">
                  {favoris.length}
                </span>
              )}
            </Link>
            <Link
              to="/panier"
              className="relative grid h-10 w-10 place-items-center transition-colors hover:bg-muted"
              aria-label="Panier"
            >
              <ShoppingBag className="h-5 w-5" strokeWidth={1.4} />
              {cartCount > 0 && (
                <span className="absolute top-1 right-0.5 grid h-4 min-w-4 place-items-center bg-orange-brand px-1 font-mono text-[10px] text-white">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {recherche && (
        <form
          onSubmit={lancer}
          role="search"
          className="border-b border-border bg-background px-4 py-3 sm:px-6"
        >
          <div className="mx-auto flex max-w-7xl items-center gap-2">
            <input
              ref={champ}
              type="search"
              value={terme}
              onChange={(e) => setTerme(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setRecherche(false);
              }}
              placeholder="Rechercher un article…"
              aria-label="Rechercher un article"
              className="h-10 min-w-0 flex-1 border border-input bg-background px-3 text-sm"
            />
            <button type="submit" className="btn-square btn-solid h-10">
              Rechercher
            </button>
          </div>
        </form>
      )}

      {open && (
        <nav className="border-b border-border bg-background px-4 py-2 md:hidden">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="nav-lien block border-b border-border/60 py-4 last:border-0"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
