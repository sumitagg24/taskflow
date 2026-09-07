import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { Toaster } from 'sonner';
import { useTheme } from '@/context/ThemeContext';
import Sidebar from '@/components/layout/Sidebar';
import Navbar from '@/components/layout/Navbar';
import EmailVerificationBanner from '@/components/ui/EmailVerificationBanner';
import Dashboard from '@/components/pages/Dashboard';
import KanbanBoard from '@/components/KanbanBoard';
import Filters, { EMPTY_FILTERS, type FiltersValues } from '@/components/Filters';
import { Modal, PageLoader, EmptyState, Button, SkeletonCard, ShortcutsModal, PageHeader, SegmentedControl } from '@/components/ui';
import { QUICK_CAPTURE_EVENT } from '@/lib/daily';
import { Plus, ListTodo } from 'lucide-react';

const CommandPalette = lazy(() => import('@/components/CommandPalette'));
const TaskForm = lazy(() => import('@/components/TaskForm'));
const TaskDetailDrawer = lazy(() => import('@/components/TaskDetailDrawer'));
const AIAssistant = lazy(() => import('@/components/AIAssistant'));
const InboxPage = lazy(() => import('@/components/daily/InboxPage'));
const TodayPage = lazy(() => import('@/components/daily/TodayPage'));
const WeeklyReset = lazy(() => import('@/components/daily/WeeklyReset'));
const QuickCapture = lazy(() => import('@/components/daily/QuickCapture'));
const CalendarPage = lazy(() => import('@/components/pages/CalendarPage'));
const SettingsPage = lazy(() => import('@/components/pages/SettingsPage'));
const NotificationsPage = lazy(() => import('@/components/pages/NotificationsPage'));
const FavoritesPage = lazy(() => import('@/components/pages/FavoritesPage'));
const CategoriesPage = lazy(() => import('@/components/pages/CategoriesPage'));
const FocusTimerPage = lazy(() => import('@/components/pages/FocusTimerPage'));
const TeamPage = lazy(() => import('@/components/pages/TeamPage'));
const TemplatesPage = lazy(() => import('@/components/pages/TemplatesPage'));
const InsightsPage = lazy(() => import('@/components/pages/InsightsPage'));
const TrashPage = lazy(() => import('@/components/pages/TrashPage'));

export interface TaskData {
  _id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  dueDate?: string;
  tags?: string[];
  category?: string;
  subtasks?: unknown[];
  comments?: unknown[];
  attachments?: unknown[];
  [key: string]: unknown;
}

export interface ShellData {
  tasks: TaskData[];
  deferredTasks: TaskData[];
  loading: boolean;
  filters: FiltersValues;
  setFilters: Dispatch<SetStateAction<FiltersValues>>;
  editTask: TaskData | null;
  setEditTask: (t: TaskData | null) => void;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  detailTaskId: string | null;
  setDetailTaskId: (id: string | null) => void;
  showAIAssistant: boolean;
  setShowAIAssistant: (v: boolean) => void;
  fetchTasks: () => void;
  handleDeleteRequest: (t: TaskData) => void;
  handleEdit: (t: TaskData) => void;
  handleNewTask: () => void;
  handleFormSubmit: (t: TaskData) => void;
  handleTaskChanged: (t: Record<string, unknown>) => void;
  openPalette: () => void;
}



export const ShellContext = createContext<ShellData | null>(null);

export function useShell(): ShellData {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used within ShellContext');
  return ctx;
}

export function routeFor(section: string): string {
  switch (section) {
    case 'dashboard':
      return '/';
    case 'today':
      return '/today';
    case 'inbox':
      return '/inbox';
    case 'weekly-review':
      return '/weekly-review';
    case 'all':
      return '/tasks';
    case 'pending':
    case 'in-progress':
    case 'completed':
    case 'backlog':
      return `/tasks/${section}`;
    case 'calendar':
      return '/calendar';
    case 'insights':
      return '/insights';
    case 'analytics':
      return '/insights';
    case 'templates':
      return '/templates';
    case 'categories':
      return '/categories';
    case 'favorites':
      return '/favorites';
    case 'focus':
      return '/focus';
    case 'notifications':
      return '/notifications';
    case 'team':
      return '/team';
    case 'trash':
      return '/trash';
    case 'settings':
      return '/settings';
    default:
      return '/';
  }
}

const LIST_SECTIONS = ['all', 'pending', 'in-progress', 'completed', 'backlog'] as const;

const LIST_TITLES: Record<string, string> = {
  all: 'All Tasks',
  pending: 'To Do',
  'in-progress': 'In Progress',
  completed: 'Completed',
  backlog: 'Backlog',
};

function clearTaskParam(prev: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(prev);
  next.delete('task');
  return next;
}

function ProtectedShell(): ReactNode {
  const shell = useShell();
  const { resolvedTheme } = useTheme();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTaskId = searchParams.get('task');

  // Single source of truth: the `?task=<id>` search param drives `detailTaskId`.
  // Opening navigates with `?task=` (CommandPalette does this); closing removes
  // the param via `replace` so history stays clean.
  useEffect(() => {
    const next = urlTaskId ?? null;
    if (next !== shell.detailTaskId) shell.setDetailTaskId(next);
  }, [urlTaskId, shell]);

  const closeTask = useCallback(() => {
    setSearchParams(clearTaskParam, { replace: true });
  }, [setSearchParams]);

  // Quick capture: available from every main screen via the Q shortcut.
  // The shipped shortcut set is exactly: Ctrl/⌘+K (palette), Q (capture),
  // ? (this shortcut list), Esc/arrows/Enter inside dialogs. Nothing else.
  const [quickOpen, setQuickOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useEffect(() => {
    const isTyping = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') {
        if (isTyping(e.target)) return;
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      if (isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key.toLowerCase() === 'q') {
        e.preventDefault();
        setQuickOpen(true);
      }
    };
    const onCaptureEvent = () => setQuickOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(QUICK_CAPTURE_EVENT, onCaptureEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(QUICK_CAPTURE_EVENT, onCaptureEvent);
    };
  }, []);

  return (
    <div className="flex min-h-screen">
      <a
        href="#task-main"
        className="sr-only-focusable absolute z-[60] m-2 rounded-lg bg-yellow-400 px-3 py-2 text-sm font-medium text-gray-950"
      >
        Skip to tasks
      </a>
      <Sidebar />

      <div className="flex flex-1 flex-col min-w-0">
        <EmailVerificationBanner />
        <Navbar
          onNewTask={shell.handleNewTask}
          onOpenCommandPalette={shell.openPalette}
          onOpenAIAssistant={() => shell.setShowAIAssistant(true)}
        />

        {/* Bottom clearance on phones so page content never slides under the
            bottom navigation bar (bar height + safe-area). */}
        <main id="task-main" className="flex-1 overflow-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0" key={location.pathname}>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <Suspense fallback={null}>
        <Modal
          isOpen={shell.showForm}
          onClose={() => { shell.setShowForm(false); shell.setEditTask(null); }}
          title={shell.editTask ? 'Edit Task' : 'Create Task'}
          subtitle={shell.editTask ? 'Update task details' : 'Add a new task to your workspace'}
          size="xl"
        >
          {shell.showForm && (
            <TaskForm
              existingTask={shell.editTask}
              onSuccess={shell.handleFormSubmit}
              onCancel={() => { shell.setShowForm(false); shell.setEditTask(null); }}
            />
          )}
        </Modal>
      </Suspense>

      <Suspense fallback={null}>
        {shell.detailTaskId && (
          <TaskDetailDrawer
            taskId={shell.detailTaskId}
            onClose={closeTask}
            onChanged={(task) => shell.handleTaskChanged(task as Record<string, unknown>)}
            onEdit={(task) => {
              setSearchParams(clearTaskParam, { replace: true });
              shell.handleEdit(task as unknown as TaskData);
            }}
            onDelete={(task) => {
              setSearchParams(clearTaskParam, { replace: true });
              shell.handleDeleteRequest(task as unknown as TaskData);
            }}
          />
        )}
      </Suspense>

      {/* One-thumb create on phones. Lifted above the bottom navigation bar
          (plus safe-area) so the two never overlap. z-50 to stay above board content. */}
      <button
        onClick={shell.handleNewTask}
        className="fixed right-5 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex h-13 w-13 items-center justify-center rounded-full bg-yellow-400 text-gray-950 shadow-lg transition-all hover:bg-clay-hover active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50 focus-visible:ring-offset-2 md:hidden"
        aria-label="Create new task"
      >
        <Plus size={22} strokeWidth={2.25} aria-hidden="true" />
      </button>

      <Suspense fallback={null}>
        <AIAssistant isOpen={shell.showAIAssistant} onClose={() => shell.setShowAIAssistant(false)} />
      </Suspense>

      <Suspense fallback={null}>
        <CommandPalette
          isOpen={shell.paletteOpen}
          onClose={() => shell.setPaletteOpen(false)}
          tasks={shell.deferredTasks}
          onNewTask={shell.handleNewTask}
          onOpenAIAssistant={() => shell.setShowAIAssistant(true)}
        />
      </Suspense>

      <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Global Inbox quick capture (Q) + floating capture button. */}
      <Suspense fallback={null}>
        {quickOpen && (
          <QuickCapture
            open={quickOpen}
            onClose={() => setQuickOpen(false)}
            onCreated={(t) => {
              shell.handleFormSubmit(t as unknown as TaskData);
            }}
          />
        )}
      </Suspense>
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        theme={resolvedTheme}
        toastOptions={{ duration: 3000 }}
      />
    </div>
  );
}

function DashboardRoute(): ReactNode {
  const shell = useShell();
  const navigate = useNavigate();
  const onNavigate = useCallback(
    (section: string) => {
      navigate(routeFor(section));
    },
    [navigate]
  );
  return (
    <Dashboard
      tasks={shell.tasks}
      loading={shell.loading}
      onRefresh={shell.fetchTasks}
      onEditTask={shell.handleEdit}
      onDeleteTask={shell.handleDeleteRequest}
      onNewTask={shell.handleNewTask}
      onNavigate={onNavigate}
    />
  );
}

function TasksRoute(): ReactNode {
  const { status } = useParams<{ status?: string }>();
  const shell = useShell();
  const navigate = useNavigate();

  if (status !== undefined && !(LIST_SECTIONS as readonly string[]).includes(status)) {
    return <Navigate to="/tasks" replace />;
  }
  const activeSection = status ?? 'all';
  const scoped =
    activeSection === 'all'
      ? shell.deferredTasks
      : shell.deferredTasks.filter((t) => t.status === activeSection);
  const filtersActive = Object.values(shell.filters).some((v) => v !== '');

  return (
    <div className="animate-fadeIn p-4 lg:p-6">
      <PageHeader
        eyebrow="Workspace"
        title={LIST_TITLES[activeSection]}
        count={scoped.length}
        subtitle="Filter by status, then narrow further below."
      />
      <p className="sr-only" role="status">
        {scoped.length} {scoped.length === 1 ? 'task' : 'tasks'} shown
      </p>
      {/* Statuses live here as tabs now — not as top-level nav items. */}
      <div className="mb-4 overflow-x-auto pb-1">
        <SegmentedControl
          aria-label="Filter tasks by status"
          value={activeSection}
          onChange={(id) => navigate(id === 'all' ? '/tasks' : `/tasks/${id}`)}
          items={LIST_SECTIONS.map((s) => ({ id: s, label: LIST_TITLES[s] }))}
          className="[&_button]:min-h-[44px] md:[&_button]:min-h-[28px]"
        />
      </div>
      <Filters filters={shell.filters} onChange={shell.setFilters} />
      {shell.loading ? (
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
                onClick={() => shell.setFilters({ ...EMPTY_FILTERS })}
              >
                Clear filters
              </Button>
            ) : (
              <Button icon={<Plus size={16} />} onClick={shell.handleNewTask}>New task</Button>
            )
          }
        />
      ) : (
        <KanbanBoard
          tasks={scoped}
          onRefresh={shell.fetchTasks}
          onDelete={shell.handleDeleteRequest}
        />
      )}
    </div>
  );
}

function CalendarRoute(): ReactNode {
  return <CalendarPage />;
}

function InboxRoute(): ReactNode {
  const shell = useShell();
  const navigate = useNavigate();
  const onNavigate = useCallback(
    (section: string) => {
      navigate(routeFor(section));
    },
    [navigate]
  );
  return <InboxPage onRefresh={shell.fetchTasks} onNavigate={onNavigate} />;
}

function TodayRoute(): ReactNode {
  const shell = useShell();
  return <TodayPage onRefresh={shell.fetchTasks} />;
}

function WeeklyReviewRoute(): ReactNode {
  const shell = useShell();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  return (
    <div className="p-4 lg:p-6">
      <WeeklyReset
        open={open}
        onClose={() => {
          setOpen(false);
          navigate('/');
        }}
        onNavigate={(section) => navigate(routeFor(section))}
      />
      {!open && (
        <div className="mx-auto max-w-md py-16 text-center">
          <p className="text-sm text-gray-500">Review dismissed — no pressure. Come back any Monday.</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-3 rounded-lg bg-yellow-400 px-4 py-2 text-sm font-medium text-gray-950"
          >
            Reopen reset
          </button>
          <span className="hidden">{String(shell.tasks.length)}</span>
        </div>
      )}
    </div>
  );
}

function FavoritesRoute(): ReactNode {
  return <FavoritesPage />;
}

function CategoriesRoute(): ReactNode {
  return <CategoriesPage />;
}

function TemplatesRoute(): ReactNode {
  return <TemplatesPage />;
}

function InsightsRoute(): ReactNode {
  return <InsightsPage />;
}

function FocusRoute(): ReactNode {
  return <FocusTimerPage />;
}

function NotificationsRoute(): ReactNode {
  return <NotificationsPage />;
}

function TrashRoute(): ReactNode {
  const shell = useShell();
  return <TrashPage onRefresh={shell.fetchTasks} />;
}

function SettingsRoute(): ReactNode {
  return <SettingsPage />;
}

function TeamRoute(): ReactNode {
  return <TeamPage />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <ProtectedShell />,
    children: [
      { index: true, element: <DashboardRoute /> },
      { path: 'today', element: <TodayRoute /> },
      { path: 'inbox', element: <InboxRoute /> },
      { path: 'weekly-review', element: <WeeklyReviewRoute /> },
      { path: 'tasks', element: <TasksRoute /> },
      { path: 'tasks/:status', element: <TasksRoute /> },
      { path: 'calendar', element: <CalendarRoute /> },
      { path: 'favorites', element: <FavoritesRoute /> },
      { path: 'categories', element: <CategoriesRoute /> },
      { path: 'templates', element: <TemplatesRoute /> },
      { path: 'insights', element: <InsightsRoute /> },
      // Dead alias: /analytics merged into /insights long ago. Bookmarks land here, not on a second dashboard.
      { path: 'analytics', element: <Navigate to="/insights" replace /> },
      { path: 'focus', element: <FocusRoute /> },
      { path: 'notifications', element: <NotificationsRoute /> },
      { path: 'team', element: <TeamRoute /> },
      { path: 'trash', element: <TrashRoute /> },
      { path: 'settings', element: <SettingsRoute /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
