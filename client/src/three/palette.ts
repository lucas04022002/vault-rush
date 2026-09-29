/**
 * Les couleurs « Néon arcade » pour la 3D, en chaînes hex — sans `three`, pour
 * qu'un test puisse les comparer à `styles/tokens.css` (elles doivent être
 * identiques : un néon 3D d'une autre teinte que le bouton d'à côté se voit).
 * Une scène en fait des couleurs avec `new Color(NEON.gem)`.
 */
export const NEON = {
  bg: "#0F0A1E",
  panel: "#1A1133",
  panel2: "#26193F",
  line: "#3A2B5C",
  mag: "#FF3D8A",
  cyan: "#35E5FF",
  yel: "#FFD23F",
  gem: "#C08BFF",
  gemShadow: "#7B45B8",
  gemInk: "#1E0B33",
  text: "#FFF6FA",
  dim: "#A99CC4",
} as const;
