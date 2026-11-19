import { Component, type ReactNode } from "react";

/** Decoration that fails to load (a 3D scene, an old chunk after a deploy) disappears instead of blanking the page. */
export class QuietBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
