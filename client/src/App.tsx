import { useState, useCallback, useEffect, useDeferredValue, type ReactElement } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { ThemeProvider, useTheme, type ResolvedTheme } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { getTasks, toTaskArray, deleteTask, restoreTask } from '@/api/tasks';
import { PALETTE_USED_KEY } from '@/components/pages/Dashboard';
import { EMPTY_FILTERS, type FiltersValues } from '@/components/Filters';
import AuthPage from '@/components/pages/AuthPage';
import ForgotPasswordPage from '@/components/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/components/pages/ResetPasswordPage';
import VerifyEmailPage from '@/components/pages/VerifyEmailPage';
import OAuthCallbackPage from '@/components/pages/auth/OAuthCallbackPage';
import GoogleAuthPage from '@/components/pages/auth/GoogleAuthPage';
import VerificationNoticePage from '@/components/pages/auth/VerificationNoticePage';
import { LogoMark } from '@/components/ui';
import { router, ShellContext, type TaskData } from '@/routes';
import ErrorBoundary from '@/components/ErrorBoundary';

function AppContent() {
  const { isAuthenticated } = useAuth();
  const { resolvedTheme } = useTheme();

  return (
    <ErrorBoundary>
      <ShellContent isAuthenticated={isAuthenticated} resolvedTheme={resolvedTheme} />
    </ErrorBoundary>
  );
}

function ShellContent({ isAuthenticated, resolvedTheme }: { isAuthenticated: boolean; resolvedTheme: ResolvedTheme }) {

  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FiltersValues>({ ...EMPTY_FILTERS });
  const [editTask, setEditTask] = useState<TaskData | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);

  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showGooglePage, setShowGooglePage] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // The read-only detail drawer, keyed by id so it can fetch the fully
  // populated task itself (comments, dependency titles) rather than reusing the
  // trimmed copy the list already holds. Single source of truth is the
  // `?task=<id>` search param: ProtectedShell mirrors the URL into this state.
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  // Board + palette render the (possibly large) task list: defer re-renders
  // so typing in Filters (300ms debounce upstream) never blocks keystrokes.
  const deferredTasks = useDeferredValue(tasks);
  // An email address (or username) we know still needs verifying, captured from
  // a refused sign-in so the user is not left with nowhere to go.
  const [pendingVerification, setPendingVerification] = useState<string | null>(null);

  // Which auth screen the entry URL asked for. Captured once on mount: the
  // callback and token screens scrub the address bar as they work, and they must
  // not unmount themselves half way through by re-reading window.location.
  const [authRoute, setAuthRoute] = useState<{ kind: 'oauth' | 'reset' | 'verify' | 'google' | 'none'; token: string }>(
    () => {
      const params = new URLSearchParams(window.location.search);
      const path = window.location.pathname;
      const token = params.get('token') ?? '';
      if (path.includes('/auth/google')) return { kind: 'google', token: '' };
      if (path.includes('/auth/callback')) return { kind: 'oauth', token: '' };
      if (path.includes('reset-password')) return { kind: 'reset', token };
      if (path.includes('verify-email')) return { kind: 'verify', token };
      return { kind: 'none', token: '' };
    }
  );

  // Leave the token screens: drop the query and fall back to the sign-in form.
  const clearAuthRoute = useCallback(() => {
    window.history.replaceState({}, '', '/');
    setAuthRoute({ kind: 'none', token: '' });
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v && v !== '')
      );
      const { data } = await getTasks(params);
      setTasks(toTaskArray(data) as TaskData[]);
    } catch {
      toast.error('Could not load tasks', {
        action: { label: 'Retry', onClick: () => fetchTasks() },
      });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchTasks();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, fetchTasks]);

  // ⌘K / Ctrl-K opens the palette from anywhere. Registered on the window in
  // capture phase so it still fires while focus sits inside an input, but
  // deliberately ignores the case where a modal-level handler already ran.
  useEffect(() => {
    if (!isAuthenticated) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => {
          if (!open) localStorage.setItem(PALETTE_USED_KEY, '1');
          return !open;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAuthenticated]);

  // Idle-prefetch the interaction-critical lazy chunks so the first
  // palette/create open costs ≈ steady-state (no lazy-chunk fetch on click).
  // One idle slot with a timeout cap (not four separate ones — separate
  // requestIdleCallback calls serialize across idle periods), one parallel
  // import batch. Fire-and-forget: warms the module cache without rendering.
  // NOTE: intentionally NOT gated on isAuthenticated — the login screen sits
  // idle while users type credentials, which is exactly when warming is free.
  useEffect(() => {
    let cancelled = false;
    const warm = () => {
      if (cancelled) return;
      void Promise.all([
        import('@/components/CommandPalette'),
        import('@/components/TaskForm'),
        import('@/components/TaskDetailDrawer'),
        import('@/components/AIAssistant'),
      ]).catch(() => {});
    };
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(warm, { timeout: 1200 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const t = setTimeout(warm, 1200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  // Onboarding tracks palette discovery, so every entry point records it.
  const openPalette = useCallback(() => {
    localStorage.setItem(PALETTE_USED_KEY, '1');
    setPaletteOpen(true);
  }, []);

  // Single delete is a soft delete on the server, so the one affordance is
  // instant + Undo — no confirmation dialog. Optimistic: the row disappears
  // the moment Delete is pressed; the API call follows and rolls back only
  // on failure. Bulk delete and purge/empty-trash keep their confirms.
  const handleDeleteRequest = async (task: TaskData) => {
    const snapshot = tasks;
    setTasks((prev) => prev.filter((t) => t._id !== task._id));
    toast.success(`“${task.title}” moved to Trash`, {
      action: {
        label: 'Undo',
        onClick: async () => {
          try {
            const { data } = await restoreTask(task._id);
            const restored = data as TaskData;
            setTasks((prev) =>
              prev.some((t) => t._id === restored._id) ? prev : [restored, ...prev]
            );
            toast.success('Restored');
          } catch {
            toast.error('Could not restore — it is still in Trash');
          }
        },
      },
    });
    try {
      await deleteTask(task._id);
    } catch {
      setTasks(snapshot);
      toast.error('Failed to delete task');
    }
  };

  const handleEdit = (task: TaskData) => {
    setEditTask(task);
    setShowForm(true);
  };

  const handleNewTask = () => {
    setEditTask(null);
    setShowForm(true);
  };

  const handleFormSubmit = (task: TaskData) => {
    setTasks(prev => {
      const idx = prev.findIndex(t => t._id === task._id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = task;
        return updated;
      }
      return [task, ...prev];
    });
    setEditTask(null);
    setShowForm(false);
  };

  // The drawer mutates subtasks, comments, the timer and favourites, so its
  // fresh copy is folded back into the list the board renders from.
  const handleTaskChanged = useCallback((task: Record<string, unknown>) => {
    const incoming = task as unknown as TaskData;
    setTasks((prev) => prev.map((t) => (t._id === incoming._id ? ({ ...t, ...incoming }) : t)));
  }, []);

  // --- Auth routing ---
  if (!isAuthenticated) {
    const withToaster = (screen: ReactElement) => (
      <>
        {screen}
        <Toaster position="bottom-right" richColors closeButton theme={resolvedTheme} />
      </>
    );

    if (authRoute.kind === 'google' || showGooglePage) {
      return withToaster(
        <GoogleAuthPage
          onBack={() => {
            setShowGooglePage(false);
            clearAuthRoute();
          }}
        />
      );
    }
    // The GitHub redirect lands here with a one-time exchange code.
    if (authRoute.kind === 'oauth') {
      return withToaster(<OAuthCallbackPage onDone={clearAuthRoute} />);
    }
    if (authRoute.kind === 'reset') {
      return withToaster(<ResetPasswordPage token={authRoute.token} onSuccess={clearAuthRoute} />);
    }
    if (authRoute.kind === 'verify') {
      return withToaster(<VerifyEmailPage token={authRoute.token} onSuccess={clearAuthRoute} />);
    }
    if (pendingVerification !== null) {
      return withToaster(
        <VerificationNoticePage
          identifier={pendingVerification}
          onBack={() => setPendingVerification(null)}
        />
      );
    }
    if (showForgotPassword) {
      return withToaster(<ForgotPasswordPage onBack={() => setShowForgotPassword(false)} />);
    }
    return withToaster(
      <AuthPage
        onForgotPassword={() => setShowForgotPassword(true)}
        onVerificationNeeded={setPendingVerification}
        onGooglePage={() => {
          window.history.pushState({}, '', '/auth/google');
          setShowGooglePage(true);
        }}
      />
    );
  }

  return (
    <NotificationProvider>
      <ShellContext.Provider
        value={{
          tasks,
          deferredTasks,
          loading,
          filters,
          setFilters,
          editTask,
          setEditTask,
          showForm,
          setShowForm,
          paletteOpen,
          setPaletteOpen,
          detailTaskId,
          setDetailTaskId,
          showAIAssistant,
          setShowAIAssistant,
          fetchTasks,
          handleDeleteRequest,
          handleEdit,
          handleNewTask,
          handleFormSubmit,
          handleTaskChanged,
          openPalette,
        }}
      >
        <RouterProvider router={router} />
      </ShellContext.Provider>
    </NotificationProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </ThemeProvider>
  );
}

// AppRouter is a child of BOTH ThemeProvider and AuthProvider.
// It gates AppContent — and all its heavy lazy imports — until auth
// initialization completes. This prevents React from even evaluating
// Sidebar, Navbar, Dashboard, etc. during the splash screen phase.
// ThemeProvider stays mounted the whole time so theme state is stable.
function AppRouter() {
  const { isInitializing } = useAuth();

  if (isInitializing) {
    return <SplashScreen />;
  }

  return <AppContent />;
}

function SplashScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas">
      <div className="animate-fadeIn flex flex-col items-center gap-3">
        <LogoMark size={48} animate />
        <span className="font-display text-2xl tracking-tight text-gray-900 dark:text-gray-100">
          TaskFlow
        </span>
      </div>

      {/* Indeterminate hairline. A shimmer reads as "working" without faking a
          percentage we don't know. */}
      <div className="h-[3px] w-32 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
        <div
          className="animate-shimmer h-full rounded-full"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, var(--color-clay) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
          }}
        />
      </div>

      <p className="animate-fadeIn text-sm text-gray-500 dark:text-gray-400">Starting up…</p>
    </div>
  );
}
