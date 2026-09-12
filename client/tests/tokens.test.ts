// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";


/**
 * Garde : aucune couleur en dur hors du fichier de jetons.
 * Toute couleur du client doit passer par une variable CSS de `styles/tokens.css`.
 */

const SRC = resolve(process.cwd(), "src");
const TOKENS = join(SRC, "styles", "tokens.css");

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

describe("jetons de couleur", () => {
  const files = walk(SRC).filter((f) => f !== TOKENS);

  it("trouve des fichiers à scanner", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("le fichier de jetons existe", () => {
    expect(readFileSync(TOKENS, "utf8")).toContain("--bg");
  });

  it("aucun hex ni rgb()/hsl() hors de styles/tokens.css", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      text.split(/\r?\n/).forEach((line, i) => {
        if (HEX.test(line) || FUNC.test(line)) {
          offenders.push(`${relative(SRC, file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
