import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Application render failure:', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex-center min-h-screen" role="alert">
        <div className="card app-error-card">
          <div className="page-header-label">Something went wrong</div>
          <h1>Ledger could not display this page.</h1>
          <p>Your data is safe. Try rendering the page again or reload the application.</p>
          <div className="form-actions">
            <button className="btn btn--ghost" type="button" onClick={this.handleRetry}>
              Try again
            </button>
            <button
              className="btn btn--gold"
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload app
            </button>
          </div>
        </div>
      </main>
    );
  }
}
