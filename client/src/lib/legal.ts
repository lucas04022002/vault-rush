/**
 * Informations légales du site.
 *
 * Les champs « À COMPLÉTER » sont volontaires : ils doivent être remplis avant
 * la mise en ligne, et se voient tout de suite à l'écran s'ils ne le sont pas.
 */

export const LEGAL = {
  siteName: "Vault Rush",
  /** Personne ou société qui édite le site. */
  editeur: "À COMPLÉTER — nom de l'éditeur du site",
  statut: "À COMPLÉTER — forme juridique et, le cas échéant, numéro d'immatriculation",
  adresse: "À COMPLÉTER — adresse postale de l'éditeur",
  contact: "À COMPLÉTER — adresse de contact",
  directeurPublication: "À COMPLÉTER — directeur de la publication",
  hebergeur: "À COMPLÉTER — hébergeur : nom, adresse, téléphone",
  derniereMiseAJour: "12/09/2026",
} as const;

/** Les points que les CGU doivent énoncer noir sur blanc. */
export const TERMS: { title: string; body: string }[] = [
  {
    title: "1. Un jeu, rien d'autre",
    body:
      "Vault Rush est un jeu de divertissement gratuit, sans mise réelle. Il n'y a ni gain, " +
      "ni perte : seulement des parties. L'accès au site et à tous les jeux est libre et " +
      "sans contrepartie.",
  },
  {
    title: "2. Les coins sont fictifs",
    body:
      "Les coins sont une unité de jeu interne, sans valeur d'aucune sorte. Ils ne " +
      "s'obtiennent que par le jeu et par la recharge gratuite. Ils ne peuvent être ni " +
      "convertis, ni transférés à un autre joueur, ni échangés contre quoi que ce soit, " +
      "à l'intérieur comme à l'extérieur du site.",
  },
  {
    title: "3. Aucune transaction",
    body:
      "Rien n'est vendu sur ce site. Aucune transaction n'est possible, aucune coordonnée " +
      "bancaire n'est demandée et le site n'en collecte aucune. Si une page vous en réclame " +
      "un jour, elle n'émane pas de nous.",
  },
  {
    title: "4. Le hasard est côté serveur",
    body:
      "Le tirage de chaque étape se fait sur le serveur, avec un générateur " +
      "cryptographique, après votre choix. Ni le navigateur ni le joueur ne peuvent " +
      "l'influencer. Les multiplicateurs et les chances de chaque mode sont affichés avant " +
      "de miser, dans le tableau des récompenses.",
  },
  {
    title: "5. Votre compte",
    body:
      "Un compte se crée avec un pseudo et un mot de passe. Vous êtes responsable de la " +
      "confidentialité de ce mot de passe. Un compte peut être fermé en cas d'abus " +
      "manifeste (automatisation, tentative d'atteinte au service).",
  },
  {
    title: "6. Données conservées",
    body:
      "Le site conserve votre pseudo, une empreinte chiffrée de votre mot de passe " +
      "(jamais le mot de passe lui-même), votre solde de coins, l'historique de vos parties " +
      "et la date de votre dernière connexion. Rien d'autre : ni suivi publicitaire, ni " +
      "revente de données, ni cookie tiers. Le seul cookie déposé est celui de votre " +
      "session, nécessaire pour rester connecté.",
  },
  {
    title: "7. Accès et suppression",
    body:
      "Vous pouvez demander l'accès à vos données ou leur suppression définitive, compte " +
      "compris, en écrivant à l'adresse de contact indiquée dans les mentions légales. " +
      "La suppression est effectuée sans condition.",
  },
  {
    title: "8. Le service est fourni tel quel",
    body:
      "Vault Rush est un projet personnel. Le service peut être interrompu, modifié ou " +
      "arrêté à tout moment, et les parties enregistrées peuvent être perdues. Comme rien " +
      "n'a de valeur, rien n'est dû.",
  },
];
