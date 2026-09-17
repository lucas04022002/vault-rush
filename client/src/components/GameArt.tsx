/**
 * L'illustration d'un jeu : une scène pleine largeur en tête de tuile.
 *
 * Dessinée en SVG ici, et non chargée comme image, pour trois raisons : le
 * trait prend la couleur du jeu (`currentColor`, donc l'accent de la tuile),
 * le dessin reste net sur un écran à forte densité, et une tuile n'attend
 * aucune requête réseau pour être complète.
 *
 * Chaque scène montre le GESTE du jeu, pas son décor : on doit comprendre ce
 * qu'on va faire avant d'avoir lu le titre. Le cadrage est volontairement
 * large (320 × 132) et le dessin déborde un peu du cadre : recadré au plus
 * juste, il aurait l'air d'un pictogramme agrandi.
 */

const commun = {
  viewBox: "0 0 320 132",
  preserveAspectRatio: "xMidYMid slice" as const,
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

/** Des portes qui montent en perspective : chaque étage, un choix. */
function MonteeScene() {
  return (
    <svg {...commun}>
      <path d="M0 108h320" strokeWidth="2" opacity="0.25" />
      {/* `width`/`height`, et non `w`/`h` : abrégés, les rectangles étaient
          posés sans dimensions — donc invisibles, alors que les poignées
          s'affichaient. */}
      {[
        { x: 22, y: 50, width: 56, height: 58 },
        { x: 96, y: 28, width: 64, height: 80 },
        { x: 178, y: 42, width: 58, height: 66 },
        { x: 254, y: 58, width: 48, height: 50 },
      ].map((porte) => (
        <g key={porte.x}>
          <rect {...porte} rx="4" strokeWidth="3" />
          <circle
            cx={porte.x + porte.width - 12}
            cy={porte.y + porte.height / 2}
            r="3"
            strokeWidth="3"
          />
        </g>
      ))}
      {/* La porte ouverte : son battant rabattu vers l'intérieur. */}
      <path d="M96 28h24v80H96z" strokeWidth="3" opacity="0.45" />
      <path d="M120 40l16-8v64l-16-8" strokeWidth="2.5" opacity="0.75" />
    </svg>
  );
}

/** Une grille de faisceaux, et la trouée qu'il faut trouver. */
function LaserScene() {
  return (
    <svg {...commun}>
      {[26, 52, 78, 104].map((y) => (
        <path key={y} d={`M0 ${y}h320`} strokeWidth="2" opacity="0.28" />
      ))}
      {[40, 90, 140, 190, 240, 290].map((x) => (
        <path key={x} d={`M${x} 8v116`} strokeWidth="2" opacity="0.18" />
      ))}
      {/* Les faisceaux actifs, plus épais, et le passage qui les évite. */}
      <path d="M0 26h130M190 26h130" strokeWidth="4" />
      <path d="M0 78h80M140 78h180" strokeWidth="4" />
      <path d="M160 132V95l-40-17 40-26" strokeWidth="3.5" opacity="0.85" />
      <circle cx="160" cy="26" r="7" strokeWidth="3.5" />
    </svg>
  );
}

/** Une route qui bifurque, vue du dessus : à chaque tronçon, deux issues. */
function FuiteScene() {
  return (
    <svg {...commun}>
      <path d="M160 132V96" strokeWidth="5" />
      <path d="M160 96 96 56M160 96l64-40" strokeWidth="4" />
      <path d="M96 56 54 22M96 56l-6 40" strokeWidth="3" opacity="0.6" />
      <path d="M224 56l42-34M224 56l6 40" strokeWidth="3" opacity="0.6" />
      <circle cx="54" cy="18" r="7" strokeWidth="3" opacity="0.6" />
      <circle cx="90" cy="102" r="7" strokeWidth="3" opacity="0.6" />
      <circle cx="266" cy="18" r="7" strokeWidth="3" opacity="0.6" />
      <circle cx="230" cy="102" r="7" strokeWidth="3" opacity="0.6" />
      <circle cx="160" cy="96" r="9" strokeWidth="4" />
    </svg>
  );
}

/** Quatre câbles au-dessus d'une minuterie : en couper un, et partir. */
function BombeScene() {
  return (
    <svg {...commun}>
      <path d="M0 30h320" strokeWidth="2" opacity="0.25" />
      {[70, 130, 190, 250].map((x, i) => (
        <path
          key={x}
          d={`M${x} 30v${i === 1 ? 26 : 44}`}
          strokeWidth="4"
          opacity={i === 1 ? 0.45 : 1}
        />
      ))}
      {/* Le câble coupé : deux bouts et un vide. */}
      <path d="M130 70v4" strokeWidth="4" opacity="0.45" />
      <rect x="54" y="74" width="212" height="46" rx="6" strokeWidth="3.5" />
      <path d="M96 88v14l10 7" strokeWidth="4" />
      <circle cx="96" cy="97" r="17" strokeWidth="3" opacity="0.6" />
      <path d="M150 97h84" strokeWidth="3" opacity="0.4" />
    </svg>
  );
}

/** Un clavier de coffre : quatre chiffres, et les essais qui restent. */
function CodeScene() {
  return (
    <svg {...commun}>
      <rect x="92" y="10" width="136" height="112" rx="8" strokeWidth="3.5" />
      <rect x="108" y="24" width="104" height="26" rx="4" strokeWidth="3" opacity="0.6" />
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M${122 + i * 26} 31v12`} strokeWidth="4" />
      ))}
      {[0, 1, 2].map((ligne) =>
        [0, 1, 2].map((col) => (
          <circle
            key={`${ligne}-${col}`}
            cx={122 + col * 26}
            cy={68 + ligne * 20}
            r="6"
            strokeWidth="3"
            opacity={ligne === 1 && col === 1 ? 1 : 0.45}
          />
        )),
      )}
      <path d="M32 66h34M254 66h34" strokeWidth="3" opacity="0.3" />
    </svg>
  );
}

/** Un diamant qui tombe dans les clous : le hasard décide, pas le joueur. */
function ChuteScene() {
  return (
    <svg {...commun}>
      <path d="M160 6l11 13-11 13-11-13z" strokeWidth="3.5" />
      {[0, 1, 2, 3].map((ligne) =>
        Array.from({ length: ligne + 3 }, (_, col) => (
          <circle
            key={`${ligne}-${col}`}
            cx={160 - (ligne + 2) * 15 + col * 30}
            cy={52 + ligne * 18}
            r="4"
            strokeWidth="3"
            opacity="0.5"
          />
        )),
      )}
      {/* Le chemin réellement pris, en clair. */}
      <path d="M160 38l-14 16 14 16-16 16 18 16" strokeWidth="3" opacity="0.85" />
      {[46, 106, 166, 226].map((x) => (
        <path key={x} d={`M${x} 124v-14`} strokeWidth="3" opacity="0.35" />
      ))}
      <path d="M0 124h320" strokeWidth="3" opacity="0.35" />
    </svg>
  );
}

/** Deux cartes et des jetons : tirer, ou rester. */
function CartesScene() {
  return (
    <svg {...commun}>
      <g transform="rotate(-12 118 70)">
        <rect x="82" y="26" width="72" height="94" rx="8" strokeWidth="3.5" />
        <path d="M118 58l10 12-10 12-10-12z" strokeWidth="3" opacity="0.7" />
      </g>
      <g transform="rotate(9 196 66)">
        <rect x="160" y="22" width="72" height="94" rx="8" strokeWidth="3.5" />
        <path d="M188 56h16M196 48v24" strokeWidth="3" opacity="0.7" />
      </g>
      <circle cx="270" cy="98" r="16" strokeWidth="3" opacity="0.55" />
      <circle cx="270" cy="98" r="8" strokeWidth="3" opacity="0.35" />
      <circle cx="46" cy="104" r="12" strokeWidth="3" opacity="0.4" />
    </svg>
  );
}

/** Portes par défaut : un jeu servi par le serveur avant d'avoir sa scène. */
const SCENES: Record<string, () => JSX.Element> = {
  "vault-rush": MonteeScene,
  "laser-grid": LaserScene,
  getaway: FuiteScene,
  "bomb-squad": BombeScene,
  "vault-code": CodeScene,
  "diamond-drop": ChuteScene,
  "blackjack-express": CartesScene,
};

export function GameArt({ gameId }: { gameId: string }) {
  const Scene = SCENES[gameId] ?? MonteeScene;
  return (
    <span className="gamecard__illu" aria-hidden="true">
      <Scene />
    </span>
  );
}
