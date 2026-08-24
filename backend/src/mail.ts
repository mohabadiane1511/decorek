import { createTransport, type Transporter } from "nodemailer";
import type { Config } from "./config.js";

/**
 * Envoi d'e-mails.
 *
 * En développement, les messages partent vers Mailpit, qui les capture et les affiche
 * sans jamais rien expédier : on peut donc éprouver les envois sans risquer d'écrire à
 * de vrais clients depuis un poste de travail. En production, les mêmes variables
 * pointent vers un vrai serveur SMTP (Gmail ou autre) — le code ne change pas.
 */
export type Courrier = {
  envoyer: (message: { a: string; sujet: string; texte: string; html?: string }) => Promise<void>;
};

export function creerCourrier(config: Config): Courrier {
  const transport: Transporter = createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    // Mailpit n'utilise ni TLS ni authentification ; un serveur public exigera les deux.
    secure: config.SMTP_SECURE,
    ...(config.SMTP_USER
      ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD ?? "" } }
      : {}),
  });

  return {
    async envoyer({ a, sujet, texte, html }) {
      try {
        await transport.sendMail({
          from: config.MAIL_FROM,
          to: a,
          subject: sujet,
          text: texte,
          ...(html ? { html } : {}),
        });
      } catch (erreur) {
        // Un envoi qui échoue ne doit pas faire échouer l'action du client. Il vaut
        // mieux un client connecté sans e-mail de confirmation qu'une inscription
        // refusée parce que le serveur de messagerie est indisponible.
        console.error(`Envoi du courriel « ${sujet} » à ${a} impossible`, erreur);
      }
    },
  };
}

/** Gabarit sobre, lisible même dans un client de messagerie qui n'affiche pas le HTML. */
export function gabarit(titre: string, corps: string, lien?: { url: string; libelle: string }) {
  const texte = [titre, "", corps, ...(lien ? ["", lien.libelle, lien.url] : [])].join("\n");

  const html = `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#2E2E2E">
  <p style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#767676;margin:0 0 24px">
    Deco'Rek — Dakar, Sénégal
  </p>
  <h1 style="font-size:22px;margin:0 0 16px">${titre}</h1>
  <p style="line-height:1.6;margin:0 0 24px">${corps}</p>
  ${
    lien
      ? `<p style="margin:0 0 24px">
           <a href="${lien.url}" style="display:inline-block;background:#F07022;color:#fff;padding:12px 24px;text-decoration:none;font-size:13px;letter-spacing:.08em;text-transform:uppercase">${lien.libelle}</a>
         </p>
         <p style="font-size:12px;color:#767676;line-height:1.6;margin:0 0 24px">
           Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>${lien.url}
         </p>`
      : ""
  }
  <p style="font-size:12px;color:#767676;border-top:1px solid #E5E5E5;padding-top:16px;margin:0">
    Vous recevez ce message parce qu'une action a été demandée avec votre adresse sur
    decorek.sn. Si ce n'est pas vous, ignorez simplement cet e-mail.
  </p>
</div>`.trim();

  return { texte, html };
}
