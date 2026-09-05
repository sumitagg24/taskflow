import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { authAPI } from '@/api/tasks';

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
  // Whether an explicit choice already existed when this session booted.
  // A stored choice always beats the server default — otherwise every login
  // or profile refresh would yank the UI back to the account default.
  const [hadStoredChoice] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  });
  // Explicit in-session choice (toggle click). Server sync never overrides it.
  const touchedRef = useRef(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    touchedRef.current = true;
    const painted = resolve(next);
    applyThemeClass(painted);
    setResolvedTheme(painted);
    setThemeState(next);
    // Persist to the account (debounced) so the choice survives new browsers
    // and devices instead of fighting the server default on every sync.
    // Fire-and-forget: the local choice stands even if the request fails.
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      try {
        const hasSession = document.cookie.split(';').some((p) => p.trim() === 'tf_session=1');
        if (!hasSession) return;
      } catch {
        return;
      }
      authAPI.updateProfile({ preferences: { theme: next } }).catch(() => {});
    }, 800);
  }, []);

  // Drop a pending persist on unmount rather than firing into a dead tree.
  useEffect(
    () => () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    },
    []
  );

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  // Sync from server-stored preferences on login/profile refresh. Applies ONLY
  // when the user has never chosen: no explicit click this session and no
  // stored choice from a previous one. Otherwise the account default (e.g.
  // 'dark' for every new signup) would clobber the toggle on every sync.
  const syncFromUser = useCallback(
    (prefs: { theme?: string } | null | undefined) => {
      if (touchedRef.current || hadStoredChoice) return;
      if (isTheme(prefs?.theme) && prefs.theme !== theme) setTheme(prefs.theme);
    },
    [setTheme, theme, hadStoredChoice]
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
