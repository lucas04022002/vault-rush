import { Component, type ReactNode } from "react";

type Props = {
  fallback: ReactNode;
  children: ReactNode;
  /** Quand cette clé change (nouvelle partie), on retente la 3D au lieu de rester sur le repli. */
  resetKey?: unknown;
  /** Prévenu quand la 3D échoue, pour que l'écran sache qu'il montre le repli. */
  onError?: () => void;
};

/**
 * Si la 3D échoue en cours de route — contexte WebGL refusé, ou perdu quand le
 * téléphone récupère sa mémoire — on montre le plateau 2D, sans message : la
 * partie vit sur le serveur, elle n'est pas touchée. Le repli dure jusqu'à la
 * partie suivante (`resetKey`) : un échec ne condamne pas la 3D pour de bon.
 */
export class Fallback extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
