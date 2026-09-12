import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router";
import { auth, wallet, type Account, type SessionUser } from "./api.ts";

/**
 * La session vit dans le cookie, jamais dans le client.
 *
 * Au démarrage, `GET /api/auth/me` dit qui est connecté et avec quel solde ;
 * ensuite le solde suit les réponses du serveur (encaissement, recharge) ou est
 * relu quand la réponse ne le porte pas. Aucun identifiant n'est stocké ici.
 */

export type SessionValue = {
  user: SessionUser | null;
  balanceCents: number;
  loading: boolean;
  /** Relit `/auth/me` (après connexion ou inscription). */
  refresh: () => Promise<void>;
  /** Pose le solde connu d'une réponse serveur. */
  setBalance: (cents: number) => void;
  /** Relit le solde quand la réponse ne le portait pas (démarrage, perte). */
  refreshBalance: () => Promise<void>;
  /** Adopte le compte renvoyé par register / login / set-password. */
  signIn: (account: Account) => void;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [balanceCents, setBalanceCents] = useState(0);
  const [loading, setLoading] = useState(true);
  // Une session fermée pendant une requête ne doit pas être « ressuscitée ».
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const account = await auth.me();
      if (!alive.current) return;
      setUser(account.user);
      setBalanceCents(account.balanceCents);
    } catch {
      // 401 : personne n'est connecté, ce n'est pas une erreur à afficher.
      if (!alive.current) return;
      setUser(null);
      setBalanceCents(0);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshBalance = useCallback(async () => {
    try {
      const { balanceCents: cents } = await wallet.balance();
      if (alive.current) setBalanceCents(cents);
    } catch {
      // Le solde affiché reste celui qu'on avait : pas de message pour ça.
    }
  }, []);

  const signIn = useCallback((account: Account) => {
    setUser(account.user);
    setBalanceCents(account.balanceCents);
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      if (alive.current) {
        setUser(null);
        setBalanceCents(0);
      }
    }
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      balanceCents,
      loading,
      refresh,
      setBalance: setBalanceCents,
      refreshBalance,
      signIn,
      logout,
    }),
    [user, balanceCents, loading, refresh, refreshBalance, signIn, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession doit être utilisé dans un SessionProvider");
  return value;
}

/** Garde de route : sans session, on part vers la connexion. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const location = useLocation();

  if (loading) {
    return (
      <p className="page__loading" role="status">
        Chargement…
      </p>
    );
  }
  if (!user) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
