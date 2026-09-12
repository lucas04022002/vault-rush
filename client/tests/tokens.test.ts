// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Garde : aucune couleur en dur hors du fichier de jetons.
 * Toute couleur du client doit passer par une variable CSS de `styles/tokens.css`.
 *
 * `index.html` est scanné lui aussi, avec UNE exception nommée : la balise
 * `<meta name="theme-color">`, qu'aucune variable CSS ne peut alimenter. Sa
 * valeur est verrouillée sur le jeton `--bg` par le test suivant, donc elle ne
 * peut pas dériver en silence.
 */

const CLIENT = resolve(process.cwd());
const SRC = join(CLIENT, "src");
const INDEX = join(CLIENT, "index.html");
const TOKENS = join(SRC, "styles", "tokens.css");

const THEME_COLOR_EXCEPTION = /<meta\s+name="theme-color"/i;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const HEX = /#[0-9a-f]{3,8}\b/i;
const FUNC = /\b(?:rgba?|hsla?)\(/i;

function token(name: string): string {
  const css = readFileSync(TOKENS, "utf8");
  const match = css.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`jeton ${name} introuvable dans tokens.css`);
  return match[1];
}

describe("jetons de couleur", () => {
  const files = [...walk(SRC), INDEX].filter((f) => f !== TOKENS);

  it("trouve des fichiers à scanner", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files).toContain(INDEX);
  });

  it("le fichier de jetons existe", () => {
    expect(readFileSync(TOKENS, "utf8")).toContain("--bg");
  });

  it("aucun hex ni rgb()/hsl() hors de styles/tokens.css", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      text.split(/\r?\n/).forEach((line, i) => {
        if (file === INDEX && THEME_COLOR_EXCEPTION.test(line)) return; // exception nommée
        if (HEX.test(line) || FUNC.test(line)) {
          offenders.push(`${relative(CLIENT, file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("la seule couleur d'index.html est theme-color, et elle vaut le jeton --bg", () => {
    const html = readFileSync(INDEX, "utf8");
    const meta = html.match(/<meta\s+name="theme-color"\s+content="(#[0-9a-fA-F]{6})"\s*\/?>/i);
    expect(meta, "balise theme-color introuvable ou mal formée").not.toBeNull();
    expect(meta?.[1].toUpperCase()).toBe(token("--bg").toUpperCase());
  });
});
