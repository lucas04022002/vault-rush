import { Amount } from "../components/index.ts";
import { formatCoins, formatMultiplier } from "../lib/format.ts";
import type { VaultCodeConfig } from "./vaultCode.ts";

/**
 * La table des gains de Vault Code : une ligne par essai, une colonne par mode.
 *
 * C'est l'essai qui est en ligne, et non l'inverse : trois colonnes tiennent
 * dans la carte à toutes les largeurs, alors que sept colonnes d'essais
 * obligeraient à défiler pour lire le gain des derniers essais — or c'est
 * exactement ce qu'il faut lire AVANT de miser.
 *
 * La même table sert l'écran de jeu et la page de règles : elle est écrite une
 * fois, et tous ses nombres viennent de la configuration du serveur.
 */

export type VaultCodePayoutsProps = {
  config: VaultCodeConfig;
  /** Mise courante en centimes : ajoute le gain maximum par mode. */
  betCents?: number;
};

/** La phrase qui résume la règle du gain. Elle doit rester lisible partout. */
export const REGLE_DU_GAIN =
  "Le gain dépend du nombre d'essais utilisés : plus le code tombe tôt, plus le multiplicateur est élevé. Un joueur moins méthodique gagne moins.";

export function VaultCodePayouts({ config, betCents }: VaultCodePayoutsProps) {
  const essaisMax = Math.max(...config.modes.map((mode) => mode.essais));

  return (
    <div className="vcpay">
      {/* Zone défilante focalisable : la table se parcourt au clavier. */}
      <div
        className="vcpay__scroll"
        role="region"
        aria-label="Multiplicateurs par essai"
        tabIndex={0}
      >
        <table>
          <caption className="sr-only">
            Multiplicateur selon l'essai où le code est trouvé, par mode
          </caption>
          <thead>
            <tr>
              <th scope="col">Trouvé à</th>
              {config.modes.map((mode) => (
                <th key={mode.id} scope="col">
                  {mode.label}
                  <span className="vcpay__essais">{`${mode.essais} essais`}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: essaisMax }, (_, i) => (
              <tr key={i}>
                <th scope="row">{`Essai ${i + 1}`}</th>
                {config.modes.map((mode) => {
                  const multiplicateur = mode.multipliers[i];
                  return (
                    <td key={mode.id} data-empty={multiplicateur === undefined || undefined}>
                      {multiplicateur === undefined ? "—" : formatMultiplier(multiplicateur)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="vcpay__note">{REGLE_DU_GAIN}</p>

      {betCents === undefined ? null : (
        <ul className="vcpay__gains">
          {config.modes.map((mode) => {
            const brut = Math.round(betCents * mode.multipliers[0]);
            const plafonne = brut > config.maxPayoutCents;
            return (
              <li key={mode.id} data-capped={plafonne || undefined}>
                <span className="vcpay__gain-mode">{mode.label}</span>
                {" : gain max "}
                <Amount cents={Math.min(brut, config.maxPayoutCents)} />
                {` avec ${formatCoins(betCents)} de mise${plafonne ? " (plafond atteint)" : ""}`}
              </li>
            );
          })}
        </ul>
      )}

      <p className="vcpay__cap">{`Gain plafonné à ${formatCoins(config.maxPayoutCents)} par partie.`}</p>
    </div>
  );
}
