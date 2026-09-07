import { Component, type ReactNode, type ErrorInfo } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ hasError: true, error });
    toast.error('Something went wrong — the app will try to recover.');
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[40vh] items-center justify-center p-6">
          <Card className="max-w-md text-center">
            <h2 className="mb-2 text-lg font-semibold">Something went wrong</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
            <Button onClick={this.handleReset}>Try again</Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
