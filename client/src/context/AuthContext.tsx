import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { toast } from 'sonner';
import api from '../api/tasks';
import { useTheme } from './ThemeContext';
import { googleSignOut } from '../hooks/useGoogleAuth';
import { clearReferralCode, getReferralCode } from '@/lib/referral';

interface User {
  _id: string;
  name: string;
  username: string;
  email: string;
  avatar: string;
  bio: string;
  emailVerified: boolean;
  authProvider: string;
  preferences: {
    theme: string;
    notifications: boolean;
    emailNotifications: boolean;
  };
  pomodoroSettings: {
    workDuration: number;
    breakDuration: number;
    longBreakDuration: number;
    sessionsBeforeLongBreak: number;
  };
  focusTimeToday: number;
  streak: number;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  message?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (name: string, username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<User>) => Promise<void>;
  updateFocusTime: (minutes: number) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  /** Finish a reset link and sign the account straight in. */
  resetPassword: (token: string, password: string) => Promise<string>;
  googleAuth: (credential: string) => Promise<void>;
  /** Trade the one-time code from an OAuth redirect for a real session. */
  exchangeOAuthCode: (code: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const clearAllTokens = () => {
  // Cookie flow: server clears httpOnly cookies. Drop any legacy Bearer
  // leftovers plus the cached user snapshot.
  try {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  } catch { /* storage unavailable — ignore */ }
  localStorage.removeItem('cachedUser');
  delete api.defaults.headers.common['Authorization'];
};

const CACHED_USER_KEY = 'cachedUser';

function getCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCachedUser(user: User | null) {
  try {
    if (user) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(CACHED_USER_KEY);
    }
  } catch {
    // quota exceeded or private mode — ignore
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Hydrate from cache immediately — synchronous, no waiting.
  // This lets us render the dashboard instantly on refresh while
  // the profile API refreshes in the background (cookie-authenticated).
  const [user, setUser] = useState<User | null>(() => getCachedUser());

  const [isInitializing, setIsInitializing] = useState(true);
  const fetchUserRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const passRef = useRef(0);
  // Pull the theme sync fn out of ThemeContext without creating a cycle —
  // ThemeProvider is mounted above AuthContext in App.tsx, so the call is safe.
  let syncThemeFromUser: ((prefs: any) => void) | null = null;
  try {
    syncThemeFromUser = useTheme().syncFromUser;
  } catch {
    // ThemeProvider not present (e.g. in tests) — fall through.
    syncThemeFromUser = null;
  }

  // Auth init — runs on mount (empty deps). In StrictMode both effect executions
  // run. 'passRef' increments per pass so only the latest pass's init() can update
  // state. Stale passes' finally() still fires (releasing isInitializing) but their
  // side-effects are blocked by the guard.
  useEffect(() => {
    let cancelled = false;
    const pass = ++passRef.current;  // unique per effect invocation

    const init = async () => {
      // Cookie-only boot: the httpOnly session cookie rides automatically
      // via withCredentials — no token lookup, always validate with the server.
      const controller = new AbortController();
      fetchUserRef.current = controller;

      try {
        const { data } = await api.get('/auth/profile', { signal: controller.signal });
        // Only apply side-effects from the latest effect pass.
        if (pass === passRef.current && mountedRef.current) {
          setUser(data.user);
          setCachedUser(data.user);
          if (syncThemeFromUser) syncThemeFromUser(data.user?.preferences);
        }
      } catch (err: any) {
        // Genuine error (not AbortError from StrictMode cleanup).
        if (pass === passRef.current && mountedRef.current &&
            err.name !== 'CanceledError' && err.name !== 'AbortError') {
          clearAllTokens();
          setUser(null);
        }
      } finally {
        if (pass === passRef.current && mountedRef.current) {
          setIsInitializing(false);
        }
      }
    };

    mountedRef.current = true;
    init();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      fetchUserRef.current?.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme sync — separate effect so it can re-run when user preferences change
  // without re-triggering the auth init flow.
  useEffect(() => {
    if (user?.preferences && syncThemeFromUser) {
      syncThemeFromUser(user.preferences);
    }
  }, [user?.preferences, syncThemeFromUser]);

  const refreshUser = async () => {
    try {
      const { data } = await api.get('/auth/profile');
      if (mountedRef.current) {
        setUser(data.user);
        setCachedUser(data.user);
      }
    } catch {
      // silent — keep cached user
    }
  };

  // Cookie flow: the server sets httpOnly access/refresh cookies on every
  // issuance path. The JSON body still carries the pair (byte-identical, for
  // native/API consumers) but the SPA ignores it — user state only.
  const setAuth = (response: AuthResponse) => {
    if (mountedRef.current) {
      setUser(response.user);
      setCachedUser(response.user);
      if (syncThemeFromUser) syncThemeFromUser(response.user?.preferences);
    }
  };

  const login = async (identifier: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/auth/login', { identifier, password });
    setAuth(data);
    toast.success(`Welcome back, ${data.user.name}!`);
  };

  const register = async (name: string, username: string, email: string, password: string) => {
    // Referral attribution is best-effort on the server too, so a stale code
    // can't block the signup — send it if we have one and drop it either way.
    const referralCode = getReferralCode();
    const { data } = await api.post<AuthResponse & { message: string }>('/auth/register', {
      name,
      username,
      email,
      password,
      ...(referralCode ? { referralCode } : {}),
    });
    clearReferralCode();
    setAuth(data);
    toast.success(data.message || 'Account created successfully!');
  };

  const logout = async () => {
    // Reset Google session state first — prevents stale One Tap, auto-select,
    // and session-merge issues on re-login (BIS recommendation).
    googleSignOut();
    try {
      await api.post('/auth/logout').catch(() => {});
    } finally {
      clearAllTokens();
      setUser(null);
      toast.info('Logged out');
    }
  };

  const updateProfile = async (profileData: Partial<User>) => {
    const { data } = await api.put('/auth/profile', profileData);
    if (mountedRef.current) {
      setUser(data.user);
      if (syncThemeFromUser) syncThemeFromUser(data.user?.preferences);
    }
    toast.success('Profile updated');
  };

  const updateFocusTime = async (minutes: number) => {
    const { data } = await api.post('/auth/focus-time', { minutes });
    if (mountedRef.current) {
      setUser(prev => prev ? { ...prev, focusTimeToday: data.focusTimeToday } : null);
    }
  };

  const verifyEmail = async (token: string) => {
    try {
      const { data } = await api.post('/auth/verify-email', { token });
      if (mountedRef.current) setUser(prev => prev ? { ...prev, emailVerified: true } : null);
      toast.success(data.message || 'Email verified successfully!');
      return data;
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Email verification failed. Please try again.');
      throw err;
    }
  };

  const resendVerification = async (email: string) => {
    try {
      const { data } = await api.post('/auth/resend-verification', { email });
      toast.success(data.message || 'Verification email sent if the email is registered.');
      return data;
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to send verification email. Please try again.');
      throw err;
    }
  };

  // The server hands back a full session with the reset, so route it through
  // setAuth — otherwise `user` stays null and the app bounces back to sign-in.
  const resetPassword = async (token: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/auth/reset-password', { token, password });
    setAuth(data);
    return data.message || 'Password reset successfully!';
  };

  const googleAuth = async (credential: string) => {
    const { data } = await api.post<AuthResponse>('/auth/google', { credential });
    setAuth(data);
    toast.success(`Welcome, ${data.user.name}!`);
  };

  const exchangeOAuthCode = async (code: string) => {
    const { data } = await api.post<AuthResponse>('/auth/oauth/exchange', { code });
    setAuth(data);
    toast.success(`Welcome, ${data.user.name}!`);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isInitializing,
      login,
      register,
      logout,
      updateProfile,
      updateFocusTime,
      verifyEmail,
      resendVerification,
      resetPassword,
      googleAuth,
      exchangeOAuthCode,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
