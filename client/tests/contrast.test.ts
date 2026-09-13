// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";


/**
 * Garde : contraste WCAG AA sur les paires réellement utilisées par l'interface.
 * Les valeurs sont lues dans `styles/tokens.css` : changer un jeton casse ce test
 * si le texte devient illisible.
 */

const TOKENS = resolve(process.cwd(), "src/styles/tokens.css");

function tokens(): Record<string, string> {
  const css = readFileSync(TOKENS, "utf8");
  const map: Record<string, string> = {};
  for (const [, name, value] of css.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    map[name] = value;
  }
  return map;
}

/** Luminance relative WCAG d'une couleur #rrggbb. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG entre deux couleurs #rrggbb. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("contraste WCAG des jetons", () => {
  const t = tokens();

  it("la fonction de luminance est correcte sur les extrêmes", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  // Paires de texte normal : AA exige 4,5:1.
  const normal: [string, string, string][] = [
    ["texte sur fond", "--text", "--bg"],
    ["texte sur panneau", "--text", "--panel"],
    ["texte sur panneau secondaire", "--text", "--panel2"],
    ["texte secondaire sur panneau", "--dim", "--panel"],
    ["texte secondaire sur fond", "--dim", "--bg"],
    ["encre jaune sur jaune (bouton principal)", "--yel-ink", "--yel"],
    ["encre verte sur vert (étape réussie)", "--safe-ink", "--safe"],
    ["encre magenta sur magenta (puce sélectionnée)", "--mag-ink", "--mag"],
    ["encre alarme sur alarme (bouton danger)", "--alarm-ink", "--alarm"],
    ["encre cyan sur cyan (bouton principal de Laser Grid)", "--cyan-ink", "--cyan"],
    ["texte sur acier (portes de coffre)", "--text", "--steel"],
    ["cyan sur acier (molette des portes)", "--cyan", "--steel"],
    ["texte secondaire sur acier (étage au repos)", "--dim", "--steel"],
    ["cyan sur panneau (options, boutons secondaires)", "--cyan", "--panel"],
    ["cyan sur panneau secondaire", "--cyan", "--panel2"],
    ["alarme sur panneau", "--alarm", "--panel"],
    // Paire la plus serrée du produit : Amount[data-tone=bad] dans un Toast.
    ["alarme sur panneau secondaire", "--alarm", "--panel2"],
    ["texte secondaire sur panneau secondaire (étape au repos)", "--dim", "--panel2"],
    ["vert sur panneau (bénéfice)", "--safe", "--panel"],
    ["jaune sur panneau secondaire (solde)", "--yel", "--panel2"],
    ["magenta sur panneau (étiquettes)", "--mag", "--panel"],
    ["encre magenta sur magenta (bouton principal de Getaway)", "--mag-ink", "--mag"],
    ["encre orange sur orange (bouton principal de Bomb Squad)", "--orange-ink", "--orange"],
    ["orange sur panneau (gaine de câble, afficheur)", "--orange", "--panel"],
    ["orange sur panneau secondaire", "--orange", "--panel2"],
    ["orange sur fond (boîtier)", "--orange", "--bg"],
    ["glace sur panneau (afficheur et verrous de Vault Code)", "--ice", "--panel"],
    ["encre glace sur glace (pavé numérique de Vault Code)", "--ice-ink", "--ice"],
    ["améthyste sur panneau (clous, cases de Diamond Drop)", "--gem", "--panel"],
    ["encre améthyste sur améthyste (bouton principal de Diamond Drop)", "--gem-ink", "--gem"],
  ];

  for (const [label, fg, bg] of normal) {
    it(`AA 4,5:1 — ${label}`, () => {
      expect(t[fg], `jeton ${fg} absent`).toBeDefined();
      expect(t[bg], `jeton ${bg} absent`).toBeDefined();
      expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    });
  }

  // Grand texte (titres Bungee ≥ 24 px) : AA exige 3:1.
  const large: [string, string, string][] = [
    ["titre jaune sur fond", "--yel", "--bg"],
    ["titre cyan sur fond", "--cyan", "--bg"],
    ["titre magenta sur fond (Getaway)", "--mag", "--bg"],
    ["titre orange sur fond (Bomb Squad)", "--orange", "--bg"],
    ["titre glace sur fond (Vault Code)", "--ice", "--bg"],
    ["titre améthyste sur fond (Diamond Drop)", "--gem", "--bg"],
  ];

  for (const [label, fg, bg] of large) {
    it(`AA 3:1 (grand texte) — ${label}`, () => {
      expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(3);
    });
  }
});
