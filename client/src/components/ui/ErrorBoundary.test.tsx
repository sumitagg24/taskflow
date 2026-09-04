import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): JSX.Element {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  it('renders fallback with retry when a child crashes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    (console.error as any).mockRestore();
  });

  it('retry resets and re-renders children', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail = true;
    function Flaky() {
      if (fail) throw new Error('flaky');
      return <p>recovered</p>;
    }
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>
    );
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('recovered')).toBeInTheDocument();
    (console.error as any).mockRestore();
  });
});
