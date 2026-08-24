import { createTransport, type Transporter } from "nodemailer";
import type { Config } from "./config.js";
export { rendre, type Article, type Ligne, type Message } from "./mail-gabarit.js";

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
