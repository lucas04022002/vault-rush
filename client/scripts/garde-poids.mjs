/**
 * Garde : `three` ne doit JAMAIS entrer dans le morceau que charge l'accueil.
 *
 * Le plateau 3D est chargé par `React.lazy` ; un import statique de trop (un
 * type importé sans `import type`, un fichier du socle qui tire `three`) le
 * ferait passer dans le JavaScript de TOUTES les pages, sans qu'aucun test ne
 * bronche. On lit donc le build lui-même : les scripts et préchargements cités
 * par `index.html` ne contiennent pas la marque de `three`, et un autre morceau,
 * lui, la contient (sinon la garde ne vérifierait rien).
 */
import { readdirSync, readFileSync } from "node:fs";

const DIST = new URL("../dist/", import.meta.url);
const MARQUE = "isWebGLRenderer";

function echec(message) {
  console.error(`garde-poids : ${message}`);
  process.exit(1);
}

const html = readFileSync(new URL("index.html", DIST), "utf8");
const cites = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
if (cites.length === 0) echec("aucun script trouvé dans dist/index.html");

for (const fichier of cites) {
  if (readFileSync(new URL(fichier, DIST), "utf8").includes(MARQUE)) {
    echec(`three est chargé dès l'accueil, dans ${fichier}`);
  }
}

const morceaux = readdirSync(new URL("assets/", DIST)).filter((f) => f.endsWith(".js"));
const avecThree = morceaux.filter((f) =>
  readFileSync(new URL(`assets/${f}`, DIST), "utf8").includes(MARQUE),
);
if (avecThree.length === 0) echec("three absent du build : la garde ne vérifie plus rien");

console.log(`garde-poids : OK — three seulement dans ${avecThree.join(", ")}`);
