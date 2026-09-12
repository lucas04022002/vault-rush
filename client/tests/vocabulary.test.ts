// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";


/**
 * Garde : Vault Rush ne parle jamais d'argent réel. Aucun de ces mots ne doit
 * apparaître dans le client livré.
 */

const CLIENT = resolve(process.cwd());
const SRC = join(CLIENT, "src");
const INDEX = join(CLIENT, "index.html");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const FORBIDDEN = [
  "argent\\s+réel",
  "retrait",
  "dépôt",
  "payer",
  "acheter",
  "euros",
  "€",
];

describe("vocabulaire interdit", () => {
  const files = [...walk(SRC), INDEX];

  it("aucun mot d'argent réel dans le client", () => {
    const offenders: string[] = [];
    for (const word of FORBIDDEN) {
      const re = new RegExp(`(?<![\\p{L}])${word}(?![\\p{L}])`, "giu");
      for (const file of files) {
        const text = readFileSync(file, "utf8");
        text.split(/\r?\n/).forEach((line, i) => {
          if (re.test(line)) offenders.push(`${relative(CLIENT, file)}:${i + 1}: ${line.trim()}`);
          re.lastIndex = 0;
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
