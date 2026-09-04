import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './Feedback';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Remount the subtree when any key changes (e.g. active section). */
  resetKeys?: unknown[];
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render crashes below it so one broken widget cannot unmount the
 * whole shell. Mount once at the root; the fallback offers Retry (re-render)
 * plus a Dashboard escape hatch via `window.location.hash`? No — plain reload
 * fallback below keeps it dependency-free.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKeys !== this.props.resetKeys) {
      this.setState({ error: null });
    }
  }

  private handleRetry = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <EmptyState
          icon={<AlertTriangle size={22} />}
          title="Something went wrong"
          description="This panel crashed. Your data is safe — try rendering it again."
          action={<Button onClick={this.handleRetry}>Try again</Button>}
          secondaryAction={
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Reload app
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}
