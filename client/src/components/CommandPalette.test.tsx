import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CommandPalette from './CommandPalette';
import { resetFlags, setFlag } from '@/lib/flags';

// The palette reads theme + auth hooks; stub both so the test stays about the
// flag seam rather than those providers.
vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light' as const, setTheme: vi.fn(), resolvedTheme: 'light' as const }),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

const renderOpen = () =>
  render(
    <MemoryRouter>
      <CommandPalette
        isOpen
        onClose={() => {}}
        tasks={[]}
        onNewTask={() => {}}
        onOpenAIAssistant={() => {}}
      />
    </MemoryRouter>
  );

beforeEach(() => {
  resetFlags();
  // jsdom has no layout engine, so scrollIntoView is undefined — the palette
  // calls it to keep keyboard-highlighted rows visible.
  if (typeof HTMLElement.prototype.scrollIntoView !== 'function') {
    HTMLElement.prototype.scrollIntoView = () => {};
  }
});

describe('CommandPalette — ai flag seam', () => {
  it('shows the Ask-AI entry by default', () => {
    renderOpen();
    expect(screen.getByText('Ask AI assistant')).toBeInTheDocument();
  });

  it('hides the Ask-AI entry when the ai flag is explicitly off', () => {
    setFlag('ai', false);
    renderOpen();
    expect(screen.queryByText('Ask AI assistant')).not.toBeInTheDocument();
  });
});
