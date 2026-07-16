import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { Toaster, toast } from 'sonner';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { getTasks, deleteTask } from '@/api/tasks';
import Sidebar from '@/components/layout/Sidebar';
import Navbar from '@/components/layout/Navbar';
import Dashboard from '@/components/pages/Dashboard';
import KanbanBoard from '@/components/KanbanBoard';
import Filters from '@/components/Filters';
import TaskForm from '@/components/TaskForm';
import AIAssistant from '@/components/AIAssistant';
import AuthPage from '@/components/pages/AuthPage';
import ForgotPasswordPage from '@/components/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/components/pages/ResetPasswordPage';
import VerifyEmailPage from '@/components/pages/VerifyEmailPage';
import EmailVerificationBanner from '@/components/ui/EmailVerificationBanner';
import { Modal, DeleteConfirmModal, PageLoader } from '@/components/ui';
import { Loader2, Plus, Sparkles } from 'lucide-react';

const CalendarPage = lazy(() => import('@/components/pages/CalendarPage'));
const SettingsPage = lazy(() => import('@/components/pages/SettingsPage'));
const NotificationsPage = lazy(() => import('@/components/pages/NotificationsPage'));
const FavoritesPage = lazy(() => import('@/components/pages/FavoritesPage'));
const CategoriesPage = lazy(() => import('@/components/pages/CategoriesPage'));
const AnalyticsPage = lazy(() => import('@/components/pages/AnalyticsPage'));
const FocusTimerPage = lazy(() => import('@/components/pages/FocusTimerPage'));
const TeamPage = lazy(() => import('@/components/pages/TeamPage'));
const TemplatesPage = lazy(() => import('@/components/pages/TemplatesPage'));

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

type FiltersState = {
  status: string;
  priority: string;
  sort: string;
  search: string;
  category: string;
  tag: string;
};

function AppContent() {
  const { user, isAuthenticated } = useAuth();
  const { resolvedTheme } = useTheme();

  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FiltersState>({
    status: '', priority: '', sort: '', search: '', category: '', tag: '',
  });
  const [editTask, setEditTask] = useState<TaskData | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TaskData | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const queryParams = new URLSearchParams(window.location.search);
  const path = window.location.pathname;
  const tokenParam = queryParams.get('token');
  const resetToken = path.includes('reset-password') ? tokenParam : null;
  const verificationToken = path.includes('verify-email') ? tokenParam : null;

  useEffect(() => {
    // Listen for AI Assistant navigate event
    const navigateHandler = (e: CustomEvent) => {
      if (e.detail?.section) {
        setActiveSection(e.detail.section);
      }
    };
    window.addEventListener('navigate', navigateHandler as EventListener);

    return () => {
      window.removeEventListener('navigate', navigateHandler as EventListener);
    };
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v && v !== '')
      );
      const { data } = await getTasks(params);
      setTasks(data);
    } catch {
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

  const handleDeleteRequest = (task: TaskData) => {
    setDeleteTarget(task);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTask(deleteTarget._id);
      setTasks(prev => prev.filter(t => t._id !== deleteTarget._id));
      toast.success('Task deleted', { icon: '🗑️' });
      setDeleteTarget(null);
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

  const handleSearch = useCallback((query: string) => {
    setFilters(prev => ({ ...prev, search: query }));
  }, []);

  const handleNavigate = (section: string) => {
    setActiveSection(section);
  };

  // --- Auth routing ---
  if (!isAuthenticated) {
    // Check query params first
    if (resetToken && !verificationToken) {
      return (
        <>
          <ResetPasswordPage token={resetToken} onSuccess={() => {
            window.history.replaceState({}, '', window.location.pathname);
          }} />
          <Toaster position="bottom-right" richColors closeButton theme={resolvedTheme} />
        </>
      );
    }
    if (verificationToken) {
      return (
        <>
          <VerifyEmailPage token={verificationToken} onSuccess={() => {
            window.history.replaceState({}, '', window.location.pathname);
          }} />
          <Toaster position="bottom-right" richColors closeButton theme={resolvedTheme} />
        </>
      );
    }
    if (showForgotPassword) {
      return (
        <>
          <ForgotPasswordPage onBack={() => setShowForgotPassword(false)} />
          <Toaster position="bottom-right" richColors closeButton theme={resolvedTheme} />
        </>
      );
    }
    return (
      <>
        <AuthPage
          onForgotPassword={() => setShowForgotPassword(true)}
        />
        <Toaster position="bottom-right" richColors closeButton theme={resolvedTheme} />
      </>
    );
  }

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <Dashboard onEditTask={handleEdit} onNewTask={handleNewTask} />;

      case 'all':
      case 'pending':
      case 'in-progress':
      case 'completed':
      case 'backlog':
        return (
          <div className="p-4 lg:p-6 animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {activeSection === 'all' ? 'All Tasks' :
                 activeSection === 'pending' ? 'To Do' :
                 activeSection === 'in-progress' ? 'In Progress' :
                 activeSection === 'completed' ? 'Completed' : 'Backlog'}
              </h2>
              <span className="text-sm text-gray-400">
                {tasks.filter(t => activeSection === 'all' ? true : t.status === activeSection).length} tasks
              </span>
            </div>
            <Filters filters={filters} onChange={setFilters} />
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-yellow-500" />
              </div>
            ) : (
              <KanbanBoard
                tasks={activeSection === 'all' ? tasks : tasks.filter(t => t.status === activeSection)}
                onRefresh={fetchTasks}
                onEdit={handleEdit}
                onDelete={handleDeleteRequest}
              />
            )}
          </div>
        );

      case 'calendar':
        return <CalendarPage />;

      case 'favorites':
        return <FavoritesPage />;

      case 'categories':
        return <CategoriesPage />;

      case 'templates':
        return <TemplatesPage />;

      case 'analytics':
        return <AnalyticsPage />;

      case 'focus':
        return <FocusTimerPage />;

      case 'notifications':
        return <NotificationsPage />;

      case 'settings':
        return <SettingsPage />;

      case 'team':
        return <TeamPage />;

      default:
        return <Dashboard onEditTask={handleEdit} onNewTask={handleNewTask} />;
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar activeSection={activeSection} onNavigate={handleNavigate} />

      <div className="flex flex-1 flex-col min-w-0">
        <EmailVerificationBanner />
        <Navbar
          onNewTask={handleNewTask}
          onSearch={handleSearch}
          onOpenAIAssistant={() => setShowAIAssistant(true)}
          onNavigate={handleNavigate}
        />

        <main className="flex-1 overflow-auto" key={activeSection}>
          <Suspense fallback={<PageLoader />}>
            {renderContent()}
          </Suspense>
        </main>
      </div>

      <Modal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditTask(null); }}
        title={editTask ? 'Edit Task' : 'Create Task'}
        subtitle={editTask ? 'Update task details' : 'Add a new task to your workspace'}
        size="xl"
      >
        <TaskForm
          existingTask={editTask}
          onSuccess={handleFormSubmit}
          onCancel={() => { setShowForm(false); setEditTask(null); }}
        />
      </Modal>

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        onConfirm={handleDeleteConfirm}
        itemName={deleteTarget?.title}
        loading={deleting}
      />

      <button
        onClick={handleNewTask}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-400 text-gray-900 shadow-lg shadow-yellow-500/30 hover:bg-yellow-500 hover:shadow-xl hover:shadow-yellow-500/40 active:scale-95 transition-all md:hidden focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
        aria-label="Create new task"
      >
        <Plus size={24} />
      </button>

      <AIAssistant isOpen={showAIAssistant} onClose={() => setShowAIAssistant(false)} />

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
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-[#F7F8FA] dark:bg-[#0f0f13]">

      {/* Brand mark */}
      <div className="flex flex-col items-center gap-3 animate-fadeIn">
        <div className="relative">
          {/* Soft glow ring behind the icon */}
          <div className="absolute inset-0 rounded-2xl bg-yellow-400/20 blur-xl animate-pulse" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-400 shadow-lg shadow-yellow-500/30">
            <Sparkles size={28} className="text-gray-900" />
          </div>
        </div>
        <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          TaskFlow
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-40 h-1 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full animate-shimmer"
          style={{
            background: 'linear-gradient(90deg, #facc15 0%, #fde68a 50%, #facc15 100%)',
            backgroundSize: '200% 100%',
          }}
        />
      </div>

      <p className="text-sm text-gray-400 dark:text-gray-500 animate-fadeIn">
        Starting up...
      </p>
    </div>
  );
}
