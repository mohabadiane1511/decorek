import { execFileSync } from "node:child_process";
import { config as chargerEnv } from "dotenv";

/**
 * Remet à zéro les compteurs de limitation de débit avant la suite.
 *
 * Tous les tests partent de la même adresse IP et se partagent donc le même quota :
 * une trentaine de connexions et de demandes de lien suffisent à dépasser le plafond,
 * et les tests commencent à échouer les uns après les autres, au hasard de l'ordre
 * d'exécution.
 *
 * On ne touche pas au plafond lui-même : il protège réellement la connexion, et son
 * comportement est vérifié par les tests d'API, qui le déclenchent à dessein.
 */
export default function setup(): void {
  const racine = new URL("..", import.meta.url).pathname;
  chargerEnv({ path: `${racine}backend/.env`, quiet: true });

  // Remet le catalogue dans son état de référence. Les tests passent de vraies
  // commandes, donc consomment du vrai stock : au bout de quelques exécutions, les
  // articles s'épuisent et le bouton « Ajouter au panier » devient inactif, ce qui
  // fait échouer des tests qui n'ont rien à voir avec le stock.
  //
  // Le seed procède par mise à jour sur les clés naturelles : il restaure prix et
  // stocks sans toucher aux comptes existants.
  // Le seed vise la base de test, jamais celle du développement : les tests ne doivent
  // ni consommer le vrai stock ni mêler leurs commandes aux vraies.
  const urlTest = process.env["TEST_DATABASE_URL"];
  try {
    execFileSync("npm", ["run", "--prefix", "backend", "db:seed"], {
      cwd: racine,
      stdio: "pipe",
      ...(urlTest ? { env: { ...process.env, DATABASE_URL: urlTest } } : {}),
    });
  } catch {
    // Base absente : les tests le signaleront d'eux-mêmes.
  }

  try {
    execFileSync(
      "docker",
      [
        "compose",
        "-f",
        "docker-compose.yml",
        "-f",
        "docker-compose.dev.yml",
        "exec",
        "-T",
        "cache",
        "sh",
        "-c",
        // Seules les clés de limitation sont effacées : le cache du catalogue et les
        // sessions ouvertes restent en place.
        // Index 2 : celui de l'API de test, laissé distinct du développement.
        'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning -n 2 FLUSHDB',
      ],
      { cwd: racine, stdio: "pipe" },
    );
  } catch {
    // Infrastructure absente : les tests échoueront d'eux-mêmes avec un message clair.
  }
}
