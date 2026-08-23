import { Link } from "@tanstack/react-router";
const logo = "/images/logo-decorek.png";
import { useStore } from "@/lib/store";

export function Footer() {
  const { content, categories } = useStore();

  return (
    <footer className="mt-24 bg-foreground text-background">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <p className="section-index text-background/50">05 / 05 — Newsletter</p>
        <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:items-start">
          <h2 className="title-xl">
            Nouveautés
            <br />
            de la maison.
          </h2>
          <form
            className="w-full"
            onSubmit={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLFormElement).reset();
            }}
          >
            <label className="label-mono text-background/60" htmlFor="nl-email">
              Votre e-mail
            </label>
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
              <input
                id="nl-email"
                type="email"
                required
                placeholder="prenom@email.com"
                className="w-full border-b border-background/40 bg-transparent pb-3 text-lg placeholder:text-background/40 focus:border-background focus:outline-none"
              />
              <button type="submit" className="btn-square border-background text-background hover:bg-background hover:text-foreground">
                S'inscrire
              </button>
            </div>
            <p className="label-mono mt-4 text-background/50">
              Nouveautés, arrivages, éditions limitées. Zéro spam.
            </p>
          </form>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <img src={logo} alt="Deco'Rek" className="h-14 w-14" />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-background/60">
            Vaisselle, décoration et mobilier de réception. Chaque pièce est sélectionnée à Dakar
            pour l'art de recevoir.
          </p>
          <p className="label-mono mt-6 text-background/50">Deco'Rek — Dakar, Sénégal</p>
        </div>
        <div>
          <h3 className="label-mono text-background/50">Collections</h3>
          <ul className="mt-5 space-y-3 text-sm text-background/80">
            {categories.map((c) => (
              <li key={c.id}>
                <Link
                  to="/boutique"
                  search={{ categorie: c.slug }}
                  className="transition-colors hover:text-background"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="label-mono text-background/50">Aide &amp; légal</h3>
          <ul className="mt-5 space-y-3 text-sm text-background/80">
            <li>
              <Link to="/suivi" className="hover:text-background">
                Suivi de commande
              </Link>
            </li>

            <li>
              <Link to="/cgv" className="hover:text-background">
                Conditions générales
              </Link>
            </li>
            <li>
              <Link to="/admin" className="hover:text-background">
                Espace administration
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="label-mono text-background/50">Contact</h3>
          <ul className="mt-5 space-y-3 text-sm text-background/80">
            <li>{content.address}</li>
            <li>{content.phone}</li>
            <li>{content.email}</li>
          </ul>
        </div>
      </div>

      <div className="mx-auto max-w-7xl border-t border-background/15 px-4 py-6 sm:px-6">
        <p className="label-mono text-background/50">
          © {new Date().getFullYear()} Deco'Rek — Paiement à la livraison uniquement.
        </p>
      </div>
    </footer>
  );
}
