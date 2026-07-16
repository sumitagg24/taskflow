import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  syncFromUser: (prefs: { theme?: string } | null | undefined) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  // Single source of truth: the <html> element carries the theme.
  // Dark mode is represented by the `dark` class; light mode has no class
  // (the CSS `:root` defaults already cover light). Toggling only ever
  // adds/removes `dark`, so there is never a stale `light` class fighting
  // the `dark` variant's CSS cascade.
  root.classList.toggle('dark', theme === 'dark');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme');
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  });

  // Keep resolvedTheme in sync — always equals theme.
  const [resolvedTheme, setResolvedTheme] = useState<Theme>(theme);

  // Persist to localStorage and apply to DOM.
  useEffect(() => {
    applyThemeClass(theme);
    localStorage.setItem('theme', theme);
    setResolvedTheme(theme);
  }, [theme]);

  // Apply the initial theme class synchronously on first mount so there is
  // no flash of the wrong theme before React renders.
  useEffect(() => {
    applyThemeClass(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = (newTheme: Theme) => setThemeState(newTheme);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    // Apply synchronously so the class change is on the DOM before the
    // next render — the toggle button icon updates without a one-frame lag.
    applyThemeClass(next);
    localStorage.setItem('theme', next);
    setThemeState(next);
    setResolvedTheme(next);
  };

  // Sync from server-stored preferences on login/profile refresh.
  // Only applies if the server value differs from current — prevents
  // overwriting a user-initiated toggle that hasn't been saved yet.
  const syncFromUser = (prefs: { theme?: string } | null | undefined) => {
    if (prefs?.theme && (prefs.theme === 'light' || prefs.theme === 'dark') && prefs.theme !== theme) {
      applyThemeClass(prefs.theme as Theme);
      localStorage.setItem('theme', prefs.theme);
      setThemeState(prefs.theme as Theme);
      setResolvedTheme(prefs.theme as Theme);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme, syncFromUser }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
