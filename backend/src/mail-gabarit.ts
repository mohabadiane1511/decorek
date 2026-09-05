/**
 * Gabarit des e-mails, à la charte du site.
 *
 * Deux contraintes dictent la forme :
 *
 * 1. Les couleurs du site sont déclarées en `oklch`, que les clients de messagerie ne
 *    savent pas lire : elles sont transposées ici en hexadécimal.
 * 2. La mise en page passe par des tableaux et des styles en ligne. Outlook ignore les
 *    feuilles de style et les mises en page modernes ; un e-mail construit comme une
 *    page web y arrive en morceaux.
 *
 * Chaque message est aussi rendu en texte brut : certains clients ne montrent que
 *  celui-ci, et un e-mail illisible sur un téléphone d'entrée de gamme ne sert à rien.
 */

const ANTHRACITE = "#2E2E2E";
const ORANGE = "#F07022";
const SABLE = "#F8F8F8";
const BORDURE = "#E5E5E5";
const GRIS = "#767676";
const PILE = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export type Ligne = { libelle: string; valeur: string; accentue?: boolean };
export type Article = { nom: string; quantite: number; prix: string };

export type Message = {
  surtitre: string;
  titre: string;
  intro: string;
  articles?: Article[];
  totaux?: Ligne[];
  informations?: Ligne[];
  lien?: { url: string; libelle: string };
  /** Phrase de clôture, avant le pied de page. */
  conclusion?: string;
};

function echapper(valeur: string): string {
  return valeur
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function versTexte(m: Message): string {
  const morceaux = [m.surtitre.toUpperCase(), "", m.titre, "", m.intro];

  if (m.articles?.length) {
    morceaux.push("", "ARTICLES");
    for (const a of m.articles) morceaux.push(`  ${a.quantite} × ${a.nom} — ${a.prix}`);
  }
  if (m.totaux?.length) {
    morceaux.push("");
    for (const l of m.totaux) morceaux.push(`  ${l.libelle} : ${l.valeur}`);
  }
  if (m.informations?.length) {
    morceaux.push("");
    for (const l of m.informations) morceaux.push(`  ${l.libelle} : ${l.valeur}`);
  }
  if (m.lien) morceaux.push("", m.lien.libelle, m.lien.url);
  if (m.conclusion) morceaux.push("", m.conclusion);

  morceaux.push(
    "",
    "—",
    "Deco'Rek — Dakar, Sénégal",
    "Vous recevez ce message suite à une action effectuée avec votre adresse sur deco-rek.com.",
  );
  return morceaux.join("\n");
}

function versHtml(m: Message): string {
  const bloc = (contenu: string) => `<tr><td style="padding:0 32px">${contenu}</td></tr>`;

  const articles = m.articles?.length
    ? bloc(`
      <p style="font-family:${PILE};font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${GRIS};margin:32px 0 12px">Votre commande</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
        ${m.articles
          .map(
            (a) => `<tr>
              <td style="font-family:${PILE};font-size:14px;color:${ANTHRACITE};padding:10px 0;border-bottom:1px solid ${BORDURE}">
                ${echapper(a.nom)}<span style="color:${GRIS}"> × ${a.quantite}</span>
              </td>
              <td align="right" style="font-family:${PILE};font-size:14px;color:${ANTHRACITE};padding:10px 0;border-bottom:1px solid ${BORDURE};white-space:nowrap">
                ${echapper(a.prix)}
              </td>
            </tr>`,
          )
          .join("")}
      </table>`)
    : "";

  const lignes = (titre: string, valeurs: Ligne[]) => `
      <p style="font-family:${PILE};font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${GRIS};margin:32px 0 12px">${titre}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
        ${valeurs
          .map(
            (l) => `<tr>
              <td style="font-family:${PILE};font-size:14px;color:${GRIS};padding:6px 0">${echapper(l.libelle)}</td>
              <td align="right" style="font-family:${PILE};font-size:${l.accentue ? "16px" : "14px"};font-weight:${l.accentue ? "700" : "400"};color:${l.accentue ? ORANGE : ANTHRACITE};padding:6px 0;white-space:nowrap">${echapper(l.valeur)}</td>
            </tr>`,
          )
          .join("")}
      </table>`;

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapper(m.titre)}</title></head>
<body style="margin:0;padding:0;background:${SABLE}">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${SABLE};padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#FFFFFF;border:1px solid ${BORDURE}">

        <tr><td style="background:${ANTHRACITE};padding:24px 32px">
          <p style="font-family:${PILE};font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#FFFFFF;margin:0">Deco'Rek</p>
        </td></tr>

        ${bloc(`
          <p style="font-family:${PILE};font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${ORANGE};margin:32px 0 8px">${echapper(m.surtitre)}</p>
          <h1 style="font-family:${PILE};font-size:24px;font-weight:700;color:${ANTHRACITE};margin:0 0 16px;line-height:1.25">${echapper(m.titre)}</h1>
          <p style="font-family:${PILE};font-size:15px;line-height:1.65;color:${ANTHRACITE};margin:0">${echapper(m.intro)}</p>`)}

        ${articles}
        ${m.totaux?.length ? bloc(lignes("Montant", m.totaux)) : ""}
        ${m.informations?.length ? bloc(lignes("Livraison", m.informations)) : ""}

        ${
          m.lien
            ? bloc(`
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:32px 0 0">
            <tr><td style="background:${ORANGE}">
              <a href="${echapper(m.lien.url)}" style="display:inline-block;padding:14px 28px;font-family:${PILE};font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#FFFFFF;text-decoration:none">${echapper(m.lien.libelle)}</a>
            </td></tr>
          </table>
          <p style="font-family:${PILE};font-size:12px;line-height:1.6;color:${GRIS};margin:16px 0 0">
            Si le bouton ne s'ouvre pas, copiez cette adresse dans votre navigateur :<br>
            <span style="color:${ANTHRACITE};word-break:break-all">${echapper(m.lien.url)}</span>
          </p>`)
            : ""
        }

        ${m.conclusion ? bloc(`<p style="font-family:${PILE};font-size:14px;line-height:1.65;color:${ANTHRACITE};margin:32px 0 0">${echapper(m.conclusion)}</p>`) : ""}

        <tr><td style="padding:32px"><div style="border-top:1px solid ${BORDURE}"></div></td></tr>

        <tr><td style="padding:0 32px 32px">
          <p style="font-family:${PILE};font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${GRIS};margin:0 0 8px">Deco'Rek — Dakar, Sénégal</p>
          <p style="font-family:${PILE};font-size:12px;line-height:1.6;color:${GRIS};margin:0">
            Vous recevez ce message suite à une action effectuée avec votre adresse sur deco-rek.com.
            Si vous n'en êtes pas à l'origine, ignorez simplement cet e-mail.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function rendre(m: Message): { texte: string; html: string } {
  return { texte: versTexte(m), html: versHtml(m) };
}
