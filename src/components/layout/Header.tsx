import { Link } from "@tanstack/react-router";
import { Menu, ShoppingBag, User, X } from "lucide-react";
import { useState } from "react";
const logo = "/images/logo-decorek.png";
import { useStore } from "@/lib/store";

const links = [
  { to: "/boutique", label: "Boutique" },

  { to: "/suivi", label: "Suivi" },
  { to: "/contact", label: "Contact" },
] as const;

export function Header() {
  const { cartCount } = useStore();
  const [open, setOpen] = useState(false);
  const [barVisible, setBarVisible] = useState(true);

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
                className="label-mono text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "text-orange-brand border-b border-orange-brand" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Actions — à droite sur mobile et desktop */}
          <div className="order-3 flex shrink-0 items-center gap-1">
            <Link
              to="/compte"
              className="grid h-10 w-10 place-items-center transition-colors hover:bg-muted"
              aria-label="Mon compte"
            >
              <User className="h-5 w-5" strokeWidth={1.4} />
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

      {open && (
        <nav className="border-b border-border bg-background px-4 py-2 md:hidden">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="label-mono block border-b border-border/60 py-4 last:border-0"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
