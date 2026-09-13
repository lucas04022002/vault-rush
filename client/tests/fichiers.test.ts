// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Garde : un fichier laissé en vrac par une fusion doit FAIRE TOMBER une suite.
 *
 * Le 13/09, une fusion a laissé quatre blocs CSS sans accolade fermante dans
 * `styles/components.css`. Les 185 tests sont restés verts — jsdom n'analyse
 * pas le CSS — et seul `vite build` l'a signalé, en simple AVERTISSEMENT, donc
 * sans faire échouer quoi que ce soit. Deux vérifications, qui ne coûtent rien
 * et qu'aucun test de composant ne peut faire à leur place :
 *
 *   1. chaque fichier CSS du dépôt a ses accolades équilibrées ;
 *   2. aucun fichier du dépôt ne porte de marqueur de conflit Git.
 *
 * Le balayage part de la RACINE du dépôt (client, serveur, docs, scripts) :
 * une fusion ne laisse pas ses restes seulement dans le client.
 */

const CLIENT = resolve(process.cwd());
const RACINE = resolve(CLIENT, "..");

/** Dossiers qu'on ne lit jamais : rien n'y est écrit à la main. */
const IGNORÉS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".vite",
  "audit",
]);

/** Extensions de texte : le reste (png, woff2, parquet…) n'est pas lu. */
const TEXTE = /\.(css|ts|tsx|js|jsx|mjs|cjs|json|md|html|yml|yaml|sql|sh|toml)$/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORÉS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const FICHIERS = walk(RACINE);
const CSS = FICHIERS.filter((f) => f.endsWith(".css"));

/**
 * Compte les accolades hors chaînes et hors commentaires : une accolade dans
 * `content: "}"` ou dans un commentaire ne ferme rien.
 */
export function braceBalance(css: string): number {
  let solde = 0;
  let i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === "/" && css[i + 1] === "*") {
      const fin = css.indexOf("*/", i + 2);
      i = fin === -1 ? css.length : fin + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      i += 1;
      while (i < css.length && css[i] !== c) i += css[i] === "\\" ? 2 : 1;
      i += 1;
      continue;
    }
    if (c === "{") solde += 1;
    else if (c === "}") solde -= 1;
    // Une accolade fermante de trop : inutile d'aller plus loin, c'est déjà faux.
    if (solde < 0) return solde;
    i += 1;
  }
  return solde;
}

/** Les marqueurs de conflit, en début de ligne uniquement. */
const CONFLIT = /^(?:<{7}|={7}|>{7})(?: |$)/;

describe("fichiers laissés en vrac", () => {
  it("trouve les fichiers CSS du dépôt", () => {
    expect(CSS.length).toBeGreaterThanOrEqual(6);
    expect(CSS.map((f) => relative(RACINE, f).replace(/\\/g, "/"))).toContain(
      "client/src/styles/components.css",
    );
  });

  it("chaque fichier CSS a ses accolades équilibrées", () => {
    const fautifs: string[] = [];
    for (const file of CSS) {
      const solde = braceBalance(readFileSync(file, "utf8"));
      if (solde !== 0) {
        fautifs.push(
          `${relative(RACINE, file)} : ${solde > 0 ? `${solde} bloc(s) jamais fermé(s)` : `${-solde} accolade(s) fermante(s) en trop`}`,
        );
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("aucun marqueur de conflit Git dans le dépôt", () => {
    const fautifs: string[] = [];
    for (const file of FICHIERS) {
      if (!TEXTE.test(file)) continue;
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .forEach((ligne, i) => {
          if (CONFLIT.test(ligne)) fautifs.push(`${relative(RACINE, file)}:${i + 1} ${ligne.trim()}`);
        });
    }
    expect(fautifs).toEqual([]);
  });

  // La garde doit tomber sur le VRAI défaut du 13/09, pas seulement exister.
  it("attrape un bloc jamais fermé", () => {
    expect(braceBalance(".a { color: red;\n.b { color: blue; }")).toBe(1);
  });

  it("attrape une accolade fermante en trop", () => {
    expect(braceBalance(".a { color: red; } }")).toBeLessThan(0);
  });

  it("laisse passer une accolade dans une chaîne ou un commentaire", () => {
    expect(braceBalance('.a::after { content: "}"; }')).toBe(0);
    expect(braceBalance("/* { */ .a { color: red; }")).toBe(0);
    expect(braceBalance("@media (width > 40em) { .a { color: red; } }")).toBe(0);
  });

  it("attrape un marqueur de conflit en début de ligne", () => {
    for (const marqueur of ["<<<<<<< HEAD", "=======", ">>>>>>> autre-branche"]) {
      expect(CONFLIT.test(marqueur)).toBe(true);
    }
    // Une ligne de séparation d'un document n'en est pas un.
    expect(CONFLIT.test("========================")).toBe(false);
  });
});
