/**
 * La « chaleur » d'une case de Diamond Drop : les cases extrêmes sont rares et
 * rapportent gros, celles du centre sont banales. La couleur ne fait que redire ce
 * que dit le multiplicateur — elle ne porte aucune information de plus.
 */
export type SlotHeat = "chaud" | "tiede" | "froid";

/** « chaud » aux deux extrémités, « tiède » autour, « froid » au centre. */
export function heatOf(index: number, count: number): SlotHeat {
  const bord = Math.min(index, count - 1 - index);
  if (bord === 0) return "chaud";
  if (bord <= Math.max(1, Math.floor((count - 1) / 5))) return "tiede";
  return "froid";
}
