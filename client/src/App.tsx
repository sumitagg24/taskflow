import { useState, useCallback, useEffect, useDeferredValue, lazy, Suspense, type ReactElement } from 'react';
import { Toaster, toast } from 'sonner';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { getTasks, toTaskArray, deleteTask, restoreTask } from '@/api/tasks';
import Sidebar from '@/components/layout/Sidebar';
import Navbar from '@/components/layout/Navbar';
import Dashboard, { PALETTE_USED_KEY } from '@/components/pages/Dashboard';
import KanbanBoard from '@/components/KanbanBoard';
import Filters, { EMPTY_FILTERS, type FiltersValues } from '@/components/Filters';
import AuthPage from '@/components/pages/AuthPage';
import ForgotPasswordPage from '@/components/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/components/pages/ResetPasswordPage';
import VerifyEmailPage from '@/components/pages/VerifyEmailPage';
import OAuthCallbackPage from '@/components/pages/auth/OAuthCallbackPage';
import VerificationNoticePage from '@/components/pages/auth/VerificationNoticePage';
import EmailVerificationBanner from '@/components/ui/EmailVerificationBanner';
import { Modal, DeleteConfirmModal, PageLoader, EmptyState, Button, SkeletonCard, LogoMark } from '@/components/ui';
import { Plus, ListTodo } from 'lucide-react';

const CommandPalette = lazy(() => import('@/components/CommandPalette'));
const TaskForm = lazy(() => import('@/components/TaskForm'));
const TaskDetailDrawer = lazy(() => import('@/components/TaskDetailDrawer'));
const AIAssistant = lazy(() => import('@/components/AIAssistant'));
const CalendarPage = lazy(() => import('@/components/pages/CalendarPage'));
const SettingsPage = lazy(() => import('@/components/pages/SettingsPage'));
const NotificationsPage = lazy(() => import('@/components/pages/NotificationsPage'));
const FavoritesPage = lazy(() => import('@/components/pages/FavoritesPage'));
const CategoriesPage = lazy(() => import('@/components/pages/CategoriesPage'));
const AnalyticsPage = lazy(() => import('@/components/pages/AnalyticsPage'));
const FocusTimerPage = lazy(() => import('@/components/pages/FocusTimerPage'));
const TeamPage = lazy(() => import('@/components/pages/TeamPage'));
const TemplatesPage = lazy(() => import('@/components/pages/TemplatesPage'));
const InsightsPage = lazy(() => import('@/components/pages/InsightsPage'));
const TrashPage = lazy(() => import('@/components/pages/TrashPage'));

const LIST_SECTIONS = ['all', 'pending', 'in-progress', 'completed', 'backlog'] as const;

const LIST_TITLES: Record<string, string> = {
  all: 'All Tasks',
  pending: 'To Do',
  'in-progress': 'In Progress',
  completed: 'Completed',
  backlog: 'Backlog',
};

type TaskData = {
  _id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  dueDate?: string;
  tags?: string[];
  category?: string;
  subtasks?: any[];
  comments?: any[];
  attachments?: any[];
  [key: string]: any;
};

function AppContent() {
  const { user, isAuthenticated } = useAuth();
  const { resolvedTheme } = useTheme();

  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FiltersValues>({ ...EMPTY_FILTERS });
  const [editTask, setEditTask] = useState<TaskData | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TaskData | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // The read-only detail drawer, keyed by id so it can fetch the fully
  // populated task itself (comments, dependency titles) rather than reusing the
  // trimmed copy the list already holds.
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
  const [authRoute, setAuthRoute] = useState<{ kind: 'oauth' | 'reset' | 'verify' | 'none'; token: string }>(
    () => {
      const params = new URLSearchParams(window.location.search);
      const path = window.location.pathname;
      const token = params.get('token') ?? '';
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

  // "Open" means read, not edit: the drawer fetches the populated task and
  // offers Edit from its footer.
  const openTaskById = useCallback((id: string) => {
    setDetailTaskId(id);
  }, []);

  useEffect(() => {
    // Listen for AI Assistant navigate event
    const navigateHandler = (e: CustomEvent) => {
      if (e.detail?.section) {
        setActiveSection(e.detail.section);
      }
    };
    window.addEventListener('navigate', navigateHandler as EventListener);

    // Open a task in the edit modal (used by notification click-through).
    const openTaskHandler = (e: CustomEvent) => {
      if (e.detail?.id) openTaskById(e.detail.id);
    };
    window.addEventListener('open-task', openTaskHandler as EventListener);

    return () => {
      window.removeEventListener('navigate', navigateHandler as EventListener);
      window.removeEventListener('open-task', openTaskHandler as EventListener);
    };
  }, [openTaskById]);

  const fetchTasks = useCallback(async () => {
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v && v !== '')
      );
      const { data } = await getTasks(params);
      setTasks(toTaskArray(data));
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

  // Restoring from Trash (or any cross-page mutation) asks the shell to refetch
  // rather than trying to thread a task object back up through props.
  useEffect(() => {
    const onRefresh = () => { if (isAuthenticated) fetchTasks(); };
    window.addEventListener('tasks:refresh', onRefresh);
    return () => window.removeEventListener('tasks:refresh', onRefresh);
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

  // Onboarding tracks palette discovery, so every entry point records it.
  const openPalette = useCallback(() => {
    localStorage.setItem(PALETTE_USED_KEY, '1');
    setPaletteOpen(true);
  }, []);

  const handleDeleteRequest = (task: TaskData) => {
    setDeleteTarget(task);
  };

  // Delete is a soft delete on the server, so the honest affordance is an
  // instant Undo rather than a scarier confirmation dialog.
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const task = deleteTarget;
    setDeleting(true);
    try {
      await deleteTask(task._id);
      setTasks((prev) => prev.filter((t) => t._id !== task._id));
      setDeleteTarget(null);
      toast.success(`“${task.title}” moved to Trash`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              const { data } = await restoreTask(task._id);
              setTasks((prev) =>
                prev.some((t) => t._id === data._id) ? prev : [data, ...prev]
              );
              toast.success('Restored');
            } catch {
              toast.error('Could not restore — it is still in Trash');
            }
          },
        },
      });
    } catch {
      toast.error('Failed to delete task');
    } finally {
      setDeleting(false);
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
  const handleTaskChanged = useCallback((task: Record<string, any>) => {
    setTasks((prev) => prev.map((t) => (t._id === task._id ? ({ ...t, ...task } as TaskData) : t)));
  }, []);

  const handleNavigate = (section: string) => {
    setActiveSection(section);
  };

  // --- Auth routing ---
  if (!isAuthenticated) {
    const withToaster = (screen: ReactElement) => (
      <>
        {screen}
        <Toaster position="bottom-right" richColors closeButton theme={resolvedTheme} />
      </>
    );

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
      />
    );
  }

  const renderContent = () => {
    if (LIST_SECTIONS.includes(activeSection as (typeof LIST_SECTIONS)[number])) {
      const scoped = activeSection === 'all' ? deferredTasks : deferredTasks.filter((t) => t.status === activeSection);
      const filtersActive = Object.values(filters).some((v) => v !== '');

      return (
        <div className="animate-fadeIn p-4 lg:p-6">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="font-display text-2xl text-gray-900 dark:text-gray-100">
              {LIST_TITLES[activeSection]}
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {scoped.length} {scoped.length === 1 ? 'task' : 'tasks'}
            </span>
            <p className="sr-only" role="status">
              {scoped.length} {scoped.length === 1 ? 'task' : 'tasks'} shown
            </p>
          </div>
          <Filters filters={filters} onChange={setFilters} />
          {loading ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : scoped.length === 0 ? (
            <EmptyState
              icon={<ListTodo size={22} />}
              title={filtersActive ? 'No tasks match these filters' : `Nothing in ${LIST_TITLES[activeSection]}`}
              description={
                filtersActive
                  ? 'Try widening the filters, or clear them to see everything.'
                  : 'Create your first task here and it will show up instantly.'
              }
              action={
                filtersActive ? (
                  <Button
                    variant="secondary"
                    onClick={() => setFilters({ ...EMPTY_FILTERS })}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button icon={<Plus size={16} />} onClick={handleNewTask}>New task</Button>
                )
              }
            />
          ) : (
            <KanbanBoard
              tasks={scoped}
              onRefresh={fetchTasks}
              onDelete={handleDeleteRequest}
            />
          )}
        </div>
      );
    }

    switch (activeSection) {
      case 'calendar':
        return <CalendarPage />;

      case 'favorites':
        return <FavoritesPage />;

      case 'categories':
        return <CategoriesPage />;

      case 'templates':
        return <TemplatesPage />;

      case 'insights':
        return <InsightsPage />;

      case 'analytics':
        return <AnalyticsPage />;

      case 'focus':
        return <FocusTimerPage />;

      case 'notifications':
        return <NotificationsPage />;

      case 'trash':
        return <TrashPage />;

      case 'settings':
        return <SettingsPage />;

      case 'team':
        return <TeamPage />;

      case 'dashboard':
      default:
        return <Dashboard onEditTask={handleEdit} onNewTask={handleNewTask} onNavigate={handleNavigate} />;
    }
  };

  return (
    <NotificationProvider>
      <div className="flex min-h-screen">
        <a
          href="#task-main"
          className="sr-only-focusable absolute z-[60] m-2 rounded-lg bg-yellow-400 px-3 py-2 text-sm font-medium text-gray-950"
        >
          Skip to tasks
        </a>
        <Sidebar activeSection={activeSection} onNavigate={handleNavigate} />

        <div className="flex flex-1 flex-col min-w-0">
          <EmailVerificationBanner />
          <Navbar
            onNewTask={handleNewTask}
            onOpenCommandPalette={openPalette}
            onOpenAIAssistant={() => setShowAIAssistant(true)}
            onNavigate={handleNavigate}
            activeSection={activeSection}
          />

          <main id="task-main" className="flex-1 overflow-auto" key={activeSection}>
            <Suspense fallback={<PageLoader />}>
              {renderContent()}
            </Suspense>
          </main>
        </div>

        <Suspense fallback={null}>
          <Modal
            isOpen={showForm}
            onClose={() => { setShowForm(false); setEditTask(null); }}
            title={editTask ? 'Edit Task' : 'Create Task'}
            subtitle={editTask ? 'Update task details' : 'Add a new task to your workspace'}
            size="xl"
          >
            {showForm && (
              <TaskForm
                existingTask={editTask}
                onSuccess={handleFormSubmit}
                onCancel={() => { setShowForm(false); setEditTask(null); }}
              />
            )}
          </Modal>
        </Suspense>

        <DeleteConfirmModal
          isOpen={!!deleteTarget}
          onClose={() => { if (!deleting) setDeleteTarget(null); }}
          onConfirm={handleDeleteConfirm}
          itemName={deleteTarget?.title}
          loading={deleting}
        />

        <Suspense fallback={null}>
          {detailTaskId && (
            <TaskDetailDrawer
              taskId={detailTaskId}
              onClose={() => setDetailTaskId(null)}
              onChanged={handleTaskChanged}
              onEdit={(task) => { setDetailTaskId(null); handleEdit(task as TaskData); }}
              onDelete={(task) => { setDetailTaskId(null); handleDeleteRequest(task as TaskData); }}
            />
          )}
        </Suspense>

        <button
          onClick={handleNewTask}
          className="fixed right-5 bottom-5 z-40 flex h-13 w-13 items-center justify-center rounded-full bg-yellow-400 text-gray-950 shadow-lg transition-all hover:bg-clay-hover active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50 focus-visible:ring-offset-2 md:hidden"
          aria-label="Create new task"
        >
          <Plus size={22} strokeWidth={2.25} aria-hidden="true" />
        </button>

        <Suspense fallback={null}>
          <AIAssistant isOpen={showAIAssistant} onClose={() => setShowAIAssistant(false)} />
        </Suspense>

        <Suspense fallback={null}>
          <CommandPalette
            isOpen={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            tasks={deferredTasks}
            onNavigate={handleNavigate}
            onOpenTask={openTaskById}
            onNewTask={handleNewTask}
            onOpenAIAssistant={() => setShowAIAssistant(true)}
          />
        </Suspense>

        <Toaster
          position="bottom-right"
          richColors
          closeButton
          theme={resolvedTheme}
          toastOptions={{ duration: 3000 }}
        />
      </div>
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
