import { Link } from "react-router";
import { PageTitle } from "../components/index.ts";
import { LEGAL } from "../lib/legal.ts";

const LIGNES: { label: string; value: string }[] = [
  { label: "Éditeur du site", value: LEGAL.editeur },
  { label: "Statut", value: LEGAL.statut },
  { label: "Adresse", value: LEGAL.adresse },
  { label: "Contact", value: LEGAL.contact },
  { label: "Directeur de la publication", value: LEGAL.directeurPublication },
  { label: "Hébergeur", value: LEGAL.hebergeur },
];

/** Mentions légales : les champs à renseigner avant toute mise en ligne. */
export function Legal() {
  return (
    <>
      <PageTitle eyebrow="Informations légales">Mentions légales</PageTitle>

      <section className="panel" aria-label="Informations sur l'éditeur">
        <table className="listing">
          <caption>Éditeur et hébergement</caption>
          <tbody>
            {LIGNES.map((ligne) => (
              <tr key={ligne.label}>
                <th scope="row">{ligne.label}</th>
                <td>{ligne.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel prose" aria-label="Données personnelles">
        <h2>Données personnelles</h2>
        <p>
          Le site conserve un pseudo, une empreinte chiffrée du mot de passe, un solde de coins
          fictifs et l'historique des parties. Le seul cookie déposé est celui de la session.
        </p>
        <p>
          Pour consulter ou faire supprimer ces données, écrire à l'adresse de contact ci-dessus.
          La suppression est définitive et sans condition.
        </p>
        <p className="prose__meta">{`Dernière mise à jour : ${LEGAL.derniereMiseAJour}.`}</p>
      </section>

      <p className="screen__aside">
        <Link to="/cgu">Conditions générales d'utilisation</Link>
      </p>
    </>
  );
}
