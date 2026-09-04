import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';

export type Theme = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

interface ThemeContextType {
  /** The user's stored choice, which may be `system`. */
  theme: Theme;
  /** The theme actually painted — `system` resolved against the OS setting. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  syncFromUser: (prefs: { theme?: string } | null | undefined) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'theme';
const SYSTEM_QUERY = '(prefers-color-scheme: dark)';

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia?.(SYSTEM_QUERY).matches === true;
}

function resolve(theme: Theme): ResolvedTheme {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return theme;
}

function applyThemeClass(resolved: ResolvedTheme) {
  const root = document.documentElement;
  // Single source of truth: the <html> element carries the theme. Both classes
  // are written explicitly so the inline bootstrap in index.html (which sets
  // `light` or `dark`) can never leave a stale class fighting the cascade.
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('light', resolved === 'light');
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : 'light';
  });
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolve(theme));

  // Persist the choice and paint the resolved value.
  useEffect(() => {
    const next = resolve(theme);
    applyThemeClass(next);
    setResolvedTheme(next);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // Follow the OS while the choice is `system`. Without this listener the app
  // would only pick up an OS change on reload.
  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia(SYSTEM_QUERY);
    const onChange = () => {
      const next: ResolvedTheme = mq.matches ? 'dark' : 'light';
      applyThemeClass(next);
      setResolvedTheme(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    // Paint synchronously so the toggle icon and the canvas flip in the same
    // frame instead of lagging a render behind.
    const painted = resolve(next);
    applyThemeClass(painted);
    setResolvedTheme(painted);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  // Sync from server-stored preferences on login/profile refresh. Only applies
  // when the server value differs, so a local un-saved toggle isn't clobbered.
  const syncFromUser = useCallback(
    (prefs: { theme?: string } | null | undefined) => {
      if (isTheme(prefs?.theme) && prefs.theme !== theme) setTheme(prefs.theme);
    },
    [setTheme, theme]
  );

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme, syncFromUser }),
    [theme, resolvedTheme, setTheme, toggleTheme, syncFromUser]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
