import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 32,
          color: '#ff6b6b',
          background: '#1a1a1a',
          fontFamily: 'monospace',
          fontSize: 14,
          whiteSpace: 'pre-wrap',
          minHeight: '100vh',
        }}>
          <h2 style={{ color: '#ff6b6b' }}>⚠️ UI Error</h2>
          <p>{this.state.error.message}</p>
          <pre style={{ opacity: 0.6, fontSize: 12 }}>{this.state.error.stack}</pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{
              marginTop: 16, padding: '8px 16px',
              background: '#333', color: '#fff', border: 'none',
              borderRadius: 4, cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
