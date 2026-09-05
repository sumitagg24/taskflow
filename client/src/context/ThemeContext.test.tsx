import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const { updateProfileMock } = vi.hoisted(() => ({ updateProfileMock: vi.fn() }));
vi.mock('@/api/tasks', () => ({ authAPI: { updateProfile: updateProfileMock } }));

import { ThemeProvider, useTheme } from './ThemeContext';

function Probe() {
  const { theme, resolvedTheme, setTheme, syncFromUser } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme('light')}>to-light</button>
      <button onClick={() => setTheme('dark')}>to-dark</button>
      <button onClick={() => syncFromUser({ theme: 'dark' })}>sync-dark</button>
      <button onClick={() => syncFromUser({ theme: 'light' })}>sync-light</button>
    </div>
  );
}

const themeOf = () => screen.getByTestId('theme').textContent;

describe('ThemeProvider signup clobber guard', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    updateProfileMock.mockResolvedValue({ data: {} });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('applies the server default on a fresh boot with no stored choice', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    fireEvent.click(screen.getByText('sync-dark'));
    expect(themeOf()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('never lets server sync override an explicit toggle (the signup bug)', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    fireEvent.click(screen.getByText('to-light'));
    expect(themeOf()).toBe('light');
    // A late profile fetch with the stale server default must NOT revert it.
    fireEvent.click(screen.getByText('sync-dark'));
    fireEvent.click(screen.getByText('sync-dark'));
    expect(themeOf()).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('keeps a stored choice from a previous session over the server default', () => {
    localStorage.setItem('theme', 'light');
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(themeOf()).toBe('light');
    fireEvent.click(screen.getByText('sync-dark'));
    expect(themeOf()).toBe('light');
  });

  it('persists an explicit choice to the account (debounced)', async () => {
    document.cookie = 'tf_session=1';
    render(<ThemeProvider><Probe /></ThemeProvider>);
    fireEvent.click(screen.getByText('to-dark'));
    expect(updateProfileMock).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(900); });
    expect(updateProfileMock).toHaveBeenCalledWith({ preferences: { theme: 'dark' } });
    document.cookie = 'tf_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });
});
