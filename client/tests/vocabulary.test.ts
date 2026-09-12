// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Garde : Vault Rush ne parle jamais d'argent réel.
 *
 * Les motifs portent sur les RACINES, pas sur les formes exactes : « retraits »,
 * « dépôts », « paiement », « payé », « payez », « achats » et « euro » doivent
 * tomber comme « retrait » ou « acheter ». La borne gauche `(?<![\p{L}])` évite
 * les faux positifs à l'intérieur d'un mot (« rachat », « européen », « neurone »).
 *
 * Décision assumée : seule la racine `dépôt` est interdite, pas `dépos-`.
 * « déposer un pseudo » reste donc du français permis ; si un jour un écran écrit
 * « déposer des coins », c'est la relecture humaine qui l'attrape, pas ce test.
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

const FORBIDDEN: { label: string; pattern: string }[] = [
  { label: "argent réel", pattern: "argent\\s+r[ée]el\\p{L}*" },
  { label: "retrait", pattern: "retrait\\p{L}*" },
  { label: "dépôt", pattern: "d[ée]p[oô]t\\p{L}*" },
  { label: "payer / paiement", pattern: "pai(?:e|ement)\\p{L}*|pay(?:er|é|ée|ez|ant|ement)\\p{L}*" },
  { label: "acheter / achat", pattern: "achat\\p{L}*|achet\\p{L}*" },
  { label: "euro", pattern: "euros?(?![\\p{L}])" },
  { label: "€", pattern: "€" },
];

/** Les mots interdits trouvés dans un texte, un par occurrence. */
function offendersIn(text: string, source: string): string[] {
  const found: string[] = [];
  for (const { label, pattern } of FORBIDDEN) {
    const re = new RegExp(`(?<![\\p{L}])(?:${pattern})`, "giu");
    text.split(/\r?\n/).forEach((line, i) => {
      if (re.test(line)) found.push(`${source}:${i + 1} [${label}]: ${line.trim()}`);
      re.lastIndex = 0;
    });
  }
  return found;
}

describe("vocabulaire interdit", () => {
  it("aucun mot d'argent réel dans le client", () => {
    const offenders: string[] = [];
    for (const file of [...walk(SRC), INDEX]) {
      offenders.push(...offendersIn(readFileSync(file, "utf8"), relative(CLIENT, file)));
    }
    expect(offenders).toEqual([]);
  });

  // La garde doit attraper les formes fléchies, pas seulement le mot du brief.
  const caught = [
    "argent réel",
    "de l'ARGENT RÉEL ici",
    "argent reel",
    "retrait",
    "retraits impossibles",
    "aucun dépôt",
    "des dépôts",
    "depot minimum",
    "payer",
    "payé",
    "vous payez",
    "un paiement",
    "en payant",
    "acheter",
    "un achat",
    "des achats",
    "1 euro",
    "10 euros",
    "12,50 €",
  ];

  for (const sample of caught) {
    it(`attrape « ${sample} »`, () => {
      expect(offendersIn(sample, "fixture")).not.toEqual([]);
    });
  }

  // Du français innocent qui ne doit pas faire tomber la garde.
  const allowed = [
    "déposer un pseudo",
    "le rachat de la mise",
    "un joueur européen",
    "neurone",
    "payload JSON",
    "encaisser 25,00 coins",
    "coins fictifs, sans valeur",
  ];

  for (const sample of allowed) {
    it(`laisse passer « ${sample} »`, () => {
      expect(offendersIn(sample, "fixture")).toEqual([]);
    });
  }
});
