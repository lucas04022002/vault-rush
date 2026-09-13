import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { games, type GameConfig } from "../api.ts";
import { PageTitle, RewardTable, Toast } from "../components/index.ts";
import { RULES } from "../games/screens.ts";
import { formatCoins, formatPercent } from "../lib/format.ts";
import { errorMessage } from "../lib/messages.ts";

/**
 * Les règles d'un jeu, écrites depuis sa configuration serveur.
 *
 * Les tournures évitent les articles devant les mots du jeu (« étage » est
 * masculin, « ligne » est féminin) : un seul texte sert les deux jeux.
 */
export function Rules() {
  const { game = "" } = useParams();
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let annulé = false;
    setConfig(null);
    setError(null);
    void games
      .config(game)
      .then(({ game: cfg }) => {
        if (!annulé) setConfig(cfg);
      })
      .catch((err) => {
        if (!annulé) setError(errorMessage(err));
      });
    return () => {
      annulé = true;
    };
  }, [game]);

  if (error) return <Toast kind="bad">{error}</Toast>;
  if (!config) {
    return (
      <p className="page__loading" role="status">
        Chargement des règles…
      </p>
    );
  }

  // Un genre qui a ses propres règles les écrit lui-même (voir `games/screens.ts`).
  const Propres = RULES[config.kind];
  if (Propres) return <Propres config={config} />;

  const { labels, steps } = config;

  return (
    <>
      <PageTitle eyebrow="Règles">{config.name}</PageTitle>

      <section className="panel prose" aria-label="Comment ça marche">
        <h2>Comment ça marche</h2>
        <ol>
          <li>Tu choisis une mise et un mode, puis tu lances la partie.</li>
          <li>{`Chaque ${labels.step} propose plusieurs ${labels.option}s : les bonnes cachent « ${labels.safe} », les mauvaises « ${labels.danger} ».`}</li>
          <li>{`Un bon choix augmente ton multiplicateur et te rapproche de la sortie.`}</li>
          <li>{`Un mauvais choix arrête la partie : la mise est perdue.`}</li>
          <li>{`Tu peux t'arrêter quand tu veux : le bouton « ${labels.cashout} » te rend la mise multipliée.`}</li>
          <li>{`Après ${steps} ${labels.step}s sans erreur, la partie s'encaisse toute seule.`}</li>
        </ol>
        {config.id === "bomb-squad" ? (
          <p>
            {`Attention : la couleur des câbles ne dit rien. Elle suit leur rang à l'écran, pas leur contenu — le tirage se fait sur le serveur après ton clic.`}
          </p>
        ) : null}
      </section>

      <section className="panel" aria-label="Modes de jeu">
        <p className="label">Modes et multiplicateurs</p>
        <RewardTable modes={config.modes} maxPayoutCents={config.maxPayoutCents} />
        <ul className="prose__list">
          {config.modes.map((mode) => (
            <li key={mode.id}>
              <strong>{mode.label}</strong>
              {` : ${mode.safeOptions} bons choix sur ${mode.options}, soit ${formatPercent(mode.chancePerStep)} de chances à chaque ${labels.step}.`}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel prose" aria-label="Le hasard">
        <h2>Le hasard est côté serveur</h2>
        <p>
          {`Le tirage se fait sur le serveur, après ton choix, avec un générateur cryptographique. Le navigateur ne connaît jamais la réponse à l'avance, et rien de ce qui se passe à l'écran ne peut la changer.`}
        </p>
        <p>
          {`Mise comprise entre ${formatCoins(config.minBetCents)} et ${formatCoins(config.maxBetCents)}. Un gain est plafonné à ${formatCoins(config.maxPayoutCents)} par partie. Les coins sont fictifs et n'ont aucune valeur.`}
        </p>
      </section>

      <p className="screen__aside">
        <Link to={`/jeux/${config.id}`}>Jouer à {config.name}</Link>
      </p>
    </>
  );
}
