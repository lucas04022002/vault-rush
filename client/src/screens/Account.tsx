import { useState } from "react";
import { useNavigate } from "react-router";
import { Amount, Button, Chip, PageTitle, Toast } from "../components/index.ts";
import { isSoundEnabled, loadSoundPreference, setSoundEnabled } from "../lib/sound.ts";
import { useSession } from "../session.tsx";

/** Le compte : pseudo, solde, son, déconnexion. */
export function Account() {
  const navigate = useNavigate();
  const { user, balanceCents, logout } = useSession();
  // La préférence est lue une fois au montage ; elle est coupée par défaut.
  const [sound, setSound] = useState(() => {
    loadSoundPreference();
    return isSoundEnabled();
  });
  const [pending, setPending] = useState(false);

  async function seDéconnecter() {
    if (pending) return;
    setPending(true);
    try {
      await logout();
      navigate("/", { replace: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageTitle eyebrow="Ton compte">{user?.username ?? "Compte"}</PageTitle>

      <section className="panel account" aria-label="Informations du compte">
        <p className="label">Pseudo</p>
        <p className="account__value">{user?.username}</p>

        <p className="label">Solde</p>
        <p className="account__value">
          <Amount cents={balanceCents} />
        </p>

        <p className="label" id="son-libelle">
          Son
        </p>
        <div className="chips" role="group" aria-labelledby="son-libelle">
          <Chip
            selected={sound}
            aria-label="Sons du jeu"
            onClick={() => {
              const next = !sound;
              setSoundEnabled(next);
              setSound(next);
            }}
          >
            {sound ? "Activé" : "Coupé"}
          </Chip>
        </div>
        <p className="account__hint">
          Les sons ne se déclenchent qu'après une réponse du serveur : une étape franchie, une
          partie terminée. Ils sont coupés par défaut.
        </p>

        <Button variant="danger" pending={pending} onClick={() => void seDéconnecter()}>
          Se déconnecter
        </Button>
      </section>

      <Toast kind="info">
        Les coins sont fictifs et n'ont aucune valeur. Rien n'est vendu sur ce site.
      </Toast>
    </>
  );
}
