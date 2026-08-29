import { Link } from "@tanstack/react-router";
import { SiFacebook, SiInstagram, SiSnapchat, SiTiktok } from "react-icons/si";
const logo = "/images/logo-decorek.png";
import { useStore } from "@/lib/store";

export function Footer() {
  const { content, categories } = useStore();

  // Logos officiels et couleurs de marque : c'est ce qu'on reconnaît d'un coup d'œil,
  // là où une icône générique demande un temps de lecture.
  //
  // Les pastilles passent sur fond clair, condition pour que ces couleurs restent
  // lisibles : le noir de TikTok disparaîtrait sur l'anthracite du pied de page.
  const reseaux = [
    { nom: "Facebook", url: content.facebook, Icone: SiFacebook, couleur: "#1877F2" },
    { nom: "Instagram", url: content.instagram, Icone: SiInstagram, couleur: "#E4405F" },
    { nom: "TikTok", url: content.tiktok, Icone: SiTiktok, couleur: "#010101" },
    // Le jaune de Snapchat est illisible sur blanc : la marque prévoit son logo en
    // noir sur fond clair.
    { nom: "Snapchat", url: content.snapchat, Icone: SiSnapchat, couleur: "#010101" },
    // Le champ peut manquer si l'API répond avec une version antérieure — un cache
    // pas encore périmé, un déploiement en cours. Sans cette prudence, le pied de
    // page échoue et emporte toute la page avec lui.
  ].filter((r) => (r.url ?? "").trim().length > 0);

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
              <button
                type="submit"
                className="btn-square border-background text-background hover:bg-background hover:text-foreground"
              >
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
              <Link to="/confidentialite" className="hover:text-background">
                Confidentialité
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

          {/* Seuls les réseaux renseignés apparaissent : afficher une icône menant
              vers un compte inexistant vaut moins que ne rien afficher. */}
          {reseaux.length > 0 && (
            <div className="mt-6 flex gap-3">
              {reseaux.map(({ nom, url, Icone, couleur }) => (
                <a
                  key={nom}
                  href={url}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={nom}
                  title={nom}
                  className="grid h-10 w-10 place-items-center bg-background transition-opacity hover:opacity-75"
                >
                  <Icone className="h-[18px] w-[18px]" style={{ color: couleur }} />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl border-t border-background/15 px-4 py-6 sm:px-6">
        <p className="label-mono text-background/50">
          © {new Date().getFullYear()} Deco'Rek — Paiement par Wave ou Orange Money avant livraison.
        </p>
      </div>
    </footer>
  );
}
