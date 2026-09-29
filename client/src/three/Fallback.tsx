import { Component, type ReactNode } from "react";

type Props = { fallback: ReactNode; children: ReactNode };

/**
 * Si la 3D échoue en cours de route — contexte WebGL refusé, ou perdu quand le
 * téléphone récupère sa mémoire — on montre le plateau 2D, sans message : la
 * partie vit sur le serveur, elle n'est pas touchée.
 */
export class Fallback extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
