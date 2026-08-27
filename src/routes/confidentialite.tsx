import { createFileRoute, Link } from "@tanstack/react-router";
import { ShopLayout, PageHeader } from "@/components/layout/ShopLayout";
import { SITE } from "@/lib/seo";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/confidentialite")({
  head: () => ({
    meta: [
      { title: "Confidentialité et cookies | Deco'Rek" },
      {
        name: "description",
        content:
          "Quelles données Deco'Rek conserve, pourquoi, combien de temps, et comment en demander la suppression.",
      },
      { property: "og:title", content: "Confidentialité — Deco'Rek" },
      { property: "og:url", content: `${SITE}/confidentialite` },
    ],
    links: [{ rel: "canonical", href: `${SITE}/confidentialite` }],
  }),
  component: Confidentialite,
});

/**
 * Politique de confidentialité.
 *
 * Écrite en clair plutôt qu'en formules juridiques : elle s'adresse à une acheteuse,
 * pas à un tribunal. Elle décrit ce que le site fait réellement — un seul cookie, celui
 * de la connexion, et aucune mesure d'audience. Le jour où une mesure sera installée,
 * il faudra un vrai bandeau de consentement et cette page devra le dire.
 */
function Confidentialite() {
  const { content } = useStore();

  return (
    <ShopLayout>
      <PageHeader
        index="Vos données"
        title="Confidentialité et cookies"
        intro="Ce que nous conservons, pourquoi, et comment nous demander de l'effacer."
      />

      <div className="mx-auto max-w-3xl space-y-10 px-4 pb-24 sm:px-6">
        <Section titre="Ce que nous conservons">
          <p>
            Quand vous passez commande, nous enregistrons votre nom, votre téléphone, l'adresse de
            livraison et le détail de la commande. Ces informations servent à préparer le colis, à
            vous livrer et à vous joindre en cas de difficulté. Votre adresse e-mail s'y ajoute si
            vous nous la donnez, pour l'envoi de la confirmation.
          </p>
          <p>
            Si vous créez un compte, nous conservons en plus votre mot de passe sous forme chiffrée
            — nous ne pouvons pas le lire — et les adresses que vous choisissez d'enregistrer.
          </p>
        </Section>

        <Section titre="Ce que nous ne faisons pas">
          <p>
            Nous ne vendons ni ne louons vos données. Nous n'installons aucun outil publicitaire,
            aucun pixel de réseau social, et nous ne mesurons pas votre navigation.
          </p>
        </Section>

        <Section titre="Cookies">
          <p>
            Le site dépose <strong>un seul cookie</strong> : celui qui vous garde connectée d'une
            page à l'autre. Sans lui, il faudrait ressaisir son mot de passe à chaque clic. Il
            disparaît à la déconnexion.
          </p>
          <p>
            Votre panier et vos favoris ne sont pas des cookies : ils restent dans la mémoire de
            votre navigateur, sur votre appareil, et ne nous sont jamais transmis. C'est aussi
            pourquoi ils ne vous suivent pas d'un téléphone à l'autre.
          </p>
          <p>
            Un cookie strictement nécessaire au fonctionnement du site ne requiert pas votre
            consentement : c'est pourquoi aucun bandeau ne vous est imposé. Si nous ajoutons un jour
            une mesure d'audience, nous vous demanderons votre accord avant de l'activer, et cette
            page le dira.
          </p>
        </Section>

        <Section titre="Combien de temps">
          <p>
            Les commandes sont conservées le temps requis par nos obligations comptables. Un compte
            inutilisé peut être supprimé sur simple demande, ainsi que les adresses qui y sont
            enregistrées.
          </p>
        </Section>

        <Section titre="Vos droits">
          <p>
            Vous pouvez à tout moment consulter, corriger ou faire effacer vos informations. Le nom,
            le téléphone et les adresses se modifient directement depuis votre{" "}
            <Link to="/compte" className="underline">
              espace client
            </Link>
            .
          </p>
          <p>
            Pour toute autre demande — obtenir une copie de vos données, faire supprimer votre
            compte — écrivez-nous
            {content.email ? (
              <>
                {" "}
                à{" "}
                <a href={`mailto:${content.email}`} className="underline">
                  {content.email}
                </a>
              </>
            ) : (
              " depuis la page contact"
            )}
            . Nous répondons dans les meilleurs délais.
          </p>
          <p>
            Le traitement de vos données est soumis à la loi sénégalaise sur la protection des
            données personnelles. Vous pouvez saisir la Commission de protection des données
            personnelles si vous estimez vos droits méconnus.
          </p>
        </Section>

        <p className="border-t border-border pt-6 text-sm text-muted-foreground">
          Une question sur ce texte ?{" "}
          <Link to="/contact" className="underline">
            Écrivez-nous
          </Link>
          , nous préférons répondre clairement que rester vagues.
        </p>
      </div>
    </ShopLayout>
  );
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl tracking-tight">{titre}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}
