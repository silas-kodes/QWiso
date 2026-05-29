import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="glass-panel rounded-2xl p-8 max-w-md w-full text-center border border-pf-error/20">
            <div className="w-16 h-16 rounded-2xl bg-pf-error/10 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-pf-error" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-pf-text-muted text-sm mb-6">
              The application encountered an unexpected error. We've been notified and are looking into it.
            </p>
            
            {this.state.error && (
              <div className="bg-pf-bg/50 rounded-lg p-3 mb-6 text-left overflow-hidden">
                <p className="text-xs font-mono text-pf-error truncate">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full bg-pf-surface hover:bg-pf-surface-light text-white font-semibold py-3 rounded-xl transition-all border border-pf-border flex items-center justify-center gap-2"
            >
              <RefreshCcw className="w-4 h-4" />
              Refresh Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
