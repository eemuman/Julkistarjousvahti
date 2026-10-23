import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/** Vikasietoisuus: renderöinnin virhe näytetään siististi tyhjän sivun sijaan. Tyylit styles.css:ssä. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="app">
        <div className="empty" role="alert">
          <p>Sivua ei voitu näyttää. Yritä ladata uudelleen.</p>
          <button className="chip active" onClick={() => window.location.reload()}>
            Lataa uudelleen
          </button>
        </div>
      </div>
    );
  }
}
