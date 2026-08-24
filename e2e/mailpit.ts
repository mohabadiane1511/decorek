import { expect, type Page } from "@playwright/test";

/**
 * Accès à la boîte de développement Mailpit.
 *
 * Permet d'éprouver les parcours qui passent par un e-mail — confirmation d'adresse,
 * lien magique — de bout en bout, en suivant réellement le lien reçu plutôt qu'en
 * trafiquant la base. C'est le seul moyen de vérifier que le message part, qu'il
 * contient un lien exploitable, et que ce lien fait ce qu'on attend.
 */
const MAILPIT = `http://localhost:${process.env["MAIL_UI_PORT"] ?? 58025}`;

type Resume = { ID: string; Subject: string; To: { Address: string }[] };

export async function viderBoite(): Promise<void> {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
}

/** Attend l'arrivée d'un message pour une adresse et renvoie son texte. */
export async function attendreMessage(
  adresse: string,
  fragmentSujet: string,
  delaiMs = 15_000,
): Promise<string> {
  const limite = Date.now() + delaiMs;

  while (Date.now() < limite) {
    const reponse = await fetch(`${MAILPIT}/api/v1/messages?limit=50`);
    const { messages } = (await reponse.json()) as { messages: Resume[] };
    const trouve = messages.find(
      (m) =>
        m.To.some((t) => t.Address.toLowerCase() === adresse.toLowerCase()) &&
        m.Subject.includes(fragmentSujet),
    );
    if (trouve) {
      const detail = await fetch(`${MAILPIT}/api/v1/message/${trouve.ID}`);
      const { Text } = (await detail.json()) as { Text: string };
      return Text;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`Aucun message « ${fragmentSujet} » reçu par ${adresse} en ${delaiMs} ms`);
}

/** Extrait la première adresse http du corps d'un message. */
export function extraireLien(texte: string): string {
  const lien = texte.match(/https?:\/\/[^\s"<>]+/)?.[0];
  if (!lien) throw new Error(`Aucun lien trouvé dans le message :\n${texte}`);
  return lien;
}

/** Suit le lien de confirmation reçu à l'inscription. */
export async function confirmerAdresse(page: Page, adresse: string): Promise<void> {
  const texte = await attendreMessage(adresse, "Confirmez votre adresse");
  await page.goto(extraireLien(texte));
  // La confirmation ouvre la session : le client atterrit sur son espace.
  await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({
    timeout: 15_000,
  });
}
