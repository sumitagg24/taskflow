import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ListTodo, ArrowRightCircle, CheckCircle2, AlertTriangle,
  Calendar, Clock, Quote, Bell, Flame, Check, X, Plus, Pencil, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { getStats, aiAPI, getNotifications } from '@/api/tasks';
import {
  Card, CardHeader, StatCard, StatusBadge, PriorityBadge, PriorityDot,
  Button, EmptyState, Progress, SkeletonCard, LoadingRegion, KbdShortcut,
} from '@/components/ui';
import CalendarWidget from '@/components/widgets/CalendarWidget';
import FocusTimer from '@/components/widgets/FocusTimer';
import ActivityTimeline from '@/components/widgets/ActivityTimeline';
import Analytics from '@/components/widgets/Analytics';
import Categories from '@/components/widgets/Categories';
import Notes from '@/components/widgets/Notes';

interface DashboardProps {
  /** Canonical task list owned by the App shell — Dashboard never fetches it. */
  tasks: any[];
  /** Parent fetch state; the skeleton renders from this. */
  loading?: boolean;
  /** Ask the shell to refetch tasks after a cross-page mutation. */
  onRefresh?: () => void;
  onEditTask: (task: any) => void;
  onDeleteTask: (task: any) => void;
  onNewTask: () => void;
  /** Section ids match the Sidebar/App router so tiles can link into a real view. */
  onNavigate: (section: string) => void;
}

type OnboardingStep = {
  id: string;
  label: string;
  done: boolean;
  shortcut?: string;
  cta?: string;
  run?: () => void;
};

const ONBOARDING_DISMISSED = 'taskflow:onboarding-dismissed';
/** Written by the shell the first time the command palette is opened. */
export const PALETTE_USED_KEY = 'taskflow:palette-used';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

function timeAgo(date: string) {
  const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function dueLabel(date: string) {
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `In ${diff} days`;
}

/**
 * Exact due stamp for list rows: "Sep 6 · 5:00 PM". Tasks whose time is
 * midnight carry no real time-of-day, so only the date is shown.
 */
function dueStamp(date: string): string {
  const d = new Date(date);
  const day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = dueTime(date);
  return time ? `${day} · ${time}` : day;
}

/** Time-of-day only ("5:00 PM"), or '' when the due date is date-only. */
function dueTime(date: string): string {
  const d = new Date(date);
  if (d.getHours() === 0 && d.getMinutes() === 0) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const statusCount = (stats: any, id: string): number =>
  stats?.byStatus?.find((s: any) => s._id === id)?.count || 0;

export default function Dashboard({ tasks, loading = false, onRefresh, onEditTask, onDeleteTask, onNewTask, onNavigate }: DashboardProps) {
  // Reserved for future Dashboard-owned mutations; edits/deletes currently
  // flow through the parent callbacks, which already keep shell state in sync.
  void onRefresh;
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [digest, setDigest] = useState<any>(null);
  const [recentNotifications, setRecentNotifications] = useState<any[]>([]);
  const [onboardingHidden, setOnboardingHidden] = useState(
    () => localStorage.getItem(ONBOARDING_DISMISSED) === '1'
  );

  // Tasks come from the App shell (single GET /tasks there). This loader
  // covers the Dashboard-owned endpoints only: stats + decoration.
  const load = useCallback(async () => {
    try {
      const statsRes = await getStats();
      setStats(statsRes.data);
    } catch {
      // Read-only surface: a failed fetch falls through to empty states rather
      // than replacing the whole page with an error.
    }

    // Both of these are decoration — never let them gate the main render.
    try {
      const { data } = await aiAPI.generateDigest();
      setDigest(data);
    } catch {}
    try {
      const { data } = await getNotifications({ limit: 3 });
      setRecentNotifications((Array.isArray(data) ? data : (data?.items ?? [])).slice(0, 3));
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);
  const openTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled'),
    [tasks]
  );

  // "What should I touch next" ordering: soonest due date wins, priority breaks
  // ties, undated work sinks to the bottom.
  const todayTasks = useMemo(() => {
    const weight: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
    return [...openTasks]
      .sort((a, b) => {
        const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        if (ad !== bd) return ad - bd;
        return (weight[a.priority] ?? 4) - (weight[b.priority] ?? 4);
      })
      .slice(0, 5);
  }, [openTasks]);

  const upcomingDeadlines = useMemo(
    () =>
      tasks
        .filter((t) => t.dueDate && t.status !== 'completed')
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 5),
    [tasks]
  );

  const dueToday = openTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate).toDateString() === new Date().toDateString()
  ).length;

  // Activation checklist. Every step is derived from real data rather than a
  // stored flag, so it stays honest if a user deletes the thing they just made.
  const steps = useMemo<OnboardingStep[]>(() => {
    const has = (fn: (t: any) => boolean) => tasks.some(fn);
    return [
      { id: 'create', label: 'Create your first task', done: tasks.length > 0, cta: 'New task', run: onNewTask },
      { id: 'due', label: 'Give a task a due date', done: has((t) => !!t.dueDate) },
      { id: 'subtasks', label: 'Break one into subtasks', done: has((t) => (t.subtasks?.length ?? 0) > 0) },
      { id: 'timer', label: 'Track time on a task', done: has((t) => (t.timeSpent ?? 0) > 0 || (t.timeSessions?.length ?? 0) > 0) },
      { id: 'complete', label: 'Finish something', done: statusCount(stats, 'completed') > 0 },
      { id: 'palette', label: 'Open the command palette', done: localStorage.getItem(PALETTE_USED_KEY) === '1', shortcut: 'mod+K' },
    ];
  }, [tasks, stats, onNewTask]);

  const stepsDone = steps.filter((s) => s.done).length;
  const showOnboarding = !onboardingHidden && stepsDone < steps.length;
  const dismissOnboarding = () => {
    localStorage.setItem(ONBOARDING_DISMISSED, '1');
    setOnboardingHidden(true);
  };

  if (loading) {
    return (
      <LoadingRegion label="Loading your dashboard">
        <div className="grid grid-cols-1 gap-5 p-4 sm:grid-cols-2 lg:grid-cols-4 lg:p-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
      </LoadingRegion>
    );
  }

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const overdue: number = stats?.overdue || 0;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5 p-4 lg:p-6">
      {/* Hero — the date, a greeting, and the three numbers worth knowing on sight. */}
      <motion.div variants={item}>
        <Card
          padding="lg"
          className="border-yellow-200/70 bg-yellow-50/40 dark:border-yellow-500/15 dark:bg-yellow-500/[0.04]"
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="caption-upper">
                {new Date().toLocaleDateString(undefined, {
                  weekday: 'long', month: 'long', day: 'numeric',
                })}
              </p>
              <h1 className="font-display mt-1.5 text-3xl leading-tight text-gray-900 dark:text-gray-100">
                {digest?.greeting || `${greeting()}${firstName ? `, ${firstName}` : ''}`}
              </h1>
              <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                {openTasks.length === 0
                  ? 'Nothing open — a good moment to plan the next thing.'
                  : `${openTasks.length} open ${openTasks.length === 1 ? 'task' : 'tasks'}${
                      dueToday ? ` · ${dueToday} due today` : ''
                    }`}
              </p>
            </div>
            <dl className="divide-hairline flex shrink-0 items-center divide-x">
              {[
                { label: 'Streak', value: user?.streak || 0, suffix: 'd', icon: <Flame size={12} aria-hidden="true" />, danger: false },
                { label: 'Done today', value: stats?.completedToday || 0, suffix: '', icon: null, danger: false },
                { label: 'Overdue', value: overdue, suffix: '', icon: null, danger: true },
              ].map((m) => (
                <div key={m.label} className="px-4 first:pl-0 last:pr-0">
                  <dd
                    className={cn(
                      'font-display text-2xl leading-none tabular-nums',
                      m.danger && overdue > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-gray-900 dark:text-gray-100'
                    )}
                  >
                    {m.value}
                    {m.suffix}
                  </dd>
                  <dt className="caption-upper mt-1.5 flex items-center gap-1">
                    {m.icon}
                    {m.label}
                  </dt>
                </div>
              ))}
            </dl>
          </div>

          {digest?.quote && (
            <p className="border-hairline mt-5 flex items-start gap-2 border-t pt-4 text-sm italic text-gray-500 dark:text-gray-400">
              <Quote size={14} className="mt-0.5 shrink-0 text-clay" aria-hidden="true" />
              {digest.quote}
            </p>
          )}
        </Card>
      </motion.div>
      {showOnboarding && (
        <motion.div variants={item}>
          <Card padding="md">
            <CardHeader
              eyebrow="Getting started"
              title={`${stepsDone} of ${steps.length} done`}
              subtitle="Six small things that make the rest of the app click."
              action={
                <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={dismissOnboarding}>
                  Dismiss
                </Button>
              }
            />
            <Progress value={stepsDone} max={steps.length} tone="accent" label="Setup progress" />
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {steps.map((s) => (
                <li key={s.id} className="bg-surface flex items-center gap-2.5 rounded-lg px-3 py-2.5">
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                      s.done ? 'bg-green-500 text-white' : 'border-hairline-strong border'
                    )}
                  >
                    {s.done && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm',
                      s.done
                        ? 'text-gray-400 line-through dark:text-gray-500'
                        : 'text-gray-700 dark:text-gray-300'
                    )}
                  >
                    {s.label}
                  </span>
                  {!s.done && s.shortcut && <KbdShortcut keys={s.shortcut.split('+')} />}
                  {!s.done && s.run && (
                    <button
                      onClick={s.run}
                      className="shrink-0 text-xs font-medium text-yellow-700 hover:underline dark:text-yellow-400"
                    >
                      {s.cta}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </motion.div>
      )}
      {/* Status tiles double as navigation into the matching list view. */}
      <motion.div variants={item} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="To Do" value={statusCount(stats, 'pending')} icon={<ListTodo size={16} />}
          hint="Waiting to be started" onClick={() => onNavigate('pending')}
        />
        <StatCard
          label="In Progress" value={statusCount(stats, 'in-progress')} icon={<ArrowRightCircle size={16} />}
          hint="Actively being worked" onClick={() => onNavigate('in-progress')}
        />
        <StatCard
          label="Completed" value={statusCount(stats, 'completed')} icon={<CheckCircle2 size={16} />}
          hint={`${stats?.completedToday || 0} finished today`} onClick={() => onNavigate('completed')}
        />
        <StatCard
          label="Overdue" value={overdue} icon={<AlertTriangle size={16} />}
          hint={overdue ? 'Past their due date' : 'Nothing late'} onClick={() => onNavigate('all')}
        />
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CalendarWidget tasks={tasks} />

        <Card padding="md">
          <CardHeader
            eyebrow="Up next"
            title="Today's priority"
            subtitle="Soonest deadline first, then by priority."
            action={
              <Button variant="ghost" size="sm" onClick={() => onNavigate('all')}>
                View all
              </Button>
            }
          />
          {todayTasks.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<Clock size={20} />}
              title="Nothing queued up"
              description="Every open task is either done or has no deadline pressure."
              action={<Button size="sm" icon={<Plus size={14} />} onClick={onNewTask}>New task</Button>}
            />
          ) : (
            <ul className="space-y-1">
              {todayTasks.map((task) => (
                <li key={task._id}>
                  <div className="group hover:bg-card-hover flex w-full items-center gap-1.5 rounded-lg p-1.5 transition-colors">
                    <button
                      onClick={() => onEditTask(task)}
                      aria-label={`Open ${task.title}`}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left"
                    >
                      <PriorityDot priority={task.priority ?? 'none'} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {task.title}
                        </span>
                        {task.description && (
                          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                            {task.description}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {task.dueDate && (
                          <span
                            className={cn(
                              'text-xs font-medium',
                              new Date(task.dueDate) < new Date()
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-gray-500 dark:text-gray-400'
                            )}
                            title={`Due ${dueStamp(task.dueDate)}`}
                          >
                            {dueLabel(task.dueDate)}
                            {dueTime(task.dueDate) ? ` · ${dueTime(task.dueDate)}` : ''}
                          </span>
                        )}
                        <StatusBadge status={task.status} />
                      </span>
                    </button>
                    <span className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => onEditTask(task)}
                        aria-label={`Edit ${task.title}`}
                        title="Edit task"
                        className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-200/60 hover:text-gray-900 dark:hover:bg-gray-700/60 dark:hover:text-gray-100"
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTask(task)}
                        aria-label={`Delete ${task.title}`}
                        title="Delete task"
                        className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:text-red-400"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </motion.div>
      {/* Distribution across the board, as a share of the whole list. */}
      <motion.div variants={item}>
        <Card padding="md">
          <CardHeader
            eyebrow="Overview"
            title="Where the work sits"
            subtitle={`${stats?.total ?? 0} live ${(stats?.total ?? 0) === 1 ? 'task' : 'tasks'}${
              stats?.trashed ? ` · ${stats.trashed} in Trash` : ''
            }`}
            action={
              <Button variant="ghost" size="sm" onClick={() => onNavigate('insights')}>
                Insights
              </Button>
            }
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {([
              ['pending', 'To Do', 'neutral'],
              ['in-progress', 'In Progress', 'warning'],
              ['completed', 'Completed', 'success'],
              ['backlog', 'Backlog', 'neutral'],
            ] as const).map(([status, label, tone]) => {
              const count = statusCount(stats, status);
              return (
                <button
                  key={status}
                  onClick={() => onNavigate(status)}
                  className="bg-surface hover:bg-card-hover rounded-xl p-4 text-left transition-colors"
                >
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
                    <span className="font-display text-lg tabular-nums text-gray-900 dark:text-gray-100">
                      {count}
                    </span>
                  </div>
                  <Progress value={count} max={stats?.total || 1} tone={tone} size="sm" />
                </button>
              );
            })}
          </div>
        </Card>
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ActivityTimeline />
        <Categories tasks={tasks} />
        <FocusTimer />
      </motion.div>
      <motion.div variants={item} className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Analytics stats={stats} />

        <Card padding="md">
          <CardHeader
            eyebrow="Deadlines"
            title="Coming up"
            subtitle={
              upcomingDeadlines.length
                ? `Next ${upcomingDeadlines.length} dated ${upcomingDeadlines.length === 1 ? 'task' : 'tasks'}`
                : undefined
            }
            action={
              <Button variant="ghost" size="sm" onClick={() => onNavigate('calendar')}>
                Calendar
              </Button>
            }
          />
          {upcomingDeadlines.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<Calendar size={20} />}
              title="No dated work"
              description="Add a due date to a task and it shows up here."
            />
          ) : (
            <ul className="space-y-1">
              {upcomingDeadlines.map((task) => (
                <li key={task._id}>
                  <div className="group hover:bg-card-hover flex w-full items-center gap-1.5 rounded-lg p-1.5 transition-colors">
                    <button
                      onClick={() => onEditTask(task)}
                      aria-label={`Open ${task.title}`}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left"
                    >
                      <PriorityBadge priority={task.priority ?? 'none'} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {task.title}
                      </span>
                      <span className="shrink-0 text-right" title={`Due ${dueStamp(task.dueDate)}`}>
                        <span
                          className={cn(
                            'block text-xs font-medium',
                            new Date(task.dueDate) < new Date()
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-gray-600 dark:text-gray-300'
                          )}
                        >
                          {dueLabel(task.dueDate)}
                        </span>
                        <span className="block text-[11px] text-gray-400 dark:text-gray-500">
                          {dueStamp(task.dueDate)}
                        </span>
                      </span>
                    </button>
                    <span className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => onEditTask(task)}
                        aria-label={`Edit ${task.title}`}
                        title="Edit task"
                        className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-200/60 hover:text-gray-900 dark:hover:bg-gray-700/60 dark:hover:text-gray-100"
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTask(task)}
                        aria-label={`Delete ${task.title}`}
                        title="Delete task"
                        className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:text-red-400"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </motion.div>
      <motion.div variants={item} className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Notes />

        <Card padding="md">
          <CardHeader
            eyebrow="Activity"
            title="Recent notifications"
            action={
              <Button variant="ghost" size="sm" onClick={() => onNavigate('notifications')}>
                See all
              </Button>
            }
          />
          {recentNotifications.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<Bell size={20} />}
              title="All caught up"
              description="Reminders and mentions land here."
            />
          ) : (
            <ul className="space-y-2">
              {recentNotifications.map((n: any) => (
                <li key={n._id} className="bg-surface flex items-center gap-3 rounded-lg p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-500/12">
                    <Bell size={14} className="text-yellow-700 dark:text-yellow-300" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                      {n.title || 'Notification'}
                    </span>
                    {n.message && (
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                        {n.message}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                    {timeAgo(n.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </motion.div>
    </motion.div>
  );
}









