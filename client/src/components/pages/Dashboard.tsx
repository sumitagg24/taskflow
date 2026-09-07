import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar, Clock, Quote, Bell, Flame, Check, X, Plus, Pencil, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { getStats, aiAPI, getNotifications } from '@/api/tasks';
import { requestQuickCapture } from '@/lib/daily';
import {
  Card, CardHeader, StatusBadge, PriorityBadge, PriorityDot,
  Button, EmptyState, Progress, SkeletonCard, LoadingRegion, KbdShortcut,
} from '@/components/ui';
import CalendarWidget from '@/components/widgets/CalendarWidget';
import WeeklyReset, { WeeklyResetBanner } from '@/components/daily/WeeklyReset';

/** Task shape as this page reads it — the shell owns the canonical list. */
export interface DashboardTask {
  _id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  dueDate?: string;
  subtasks?: unknown[];
  timeSpent?: number;
  timeSessions?: unknown[];
  [key: string]: unknown;
}

interface DashboardProps {
  /** Canonical task list owned by the App shell — Dashboard never fetches it. */
  tasks: DashboardTask[];
  /** Parent fetch state; the skeleton renders from this. */
  loading?: boolean;
  /** Ask the shell to refetch tasks after a cross-page mutation. */
  onRefresh?: () => void;
  onEditTask: (task: DashboardTask) => void;
  onDeleteTask: (task: DashboardTask) => void;
  onNewTask: () => void;
  /** Section ids match the Sidebar/App router so rows can link into a real view. */
  onNavigate: (section: string) => void;
}

interface DashboardStats {
  total?: number;
  overdue?: number;
  completedToday?: number;
  trashed?: number;
  byStatus?: { _id: string; count: number }[];
}

interface DayDigest {
  greeting?: string;
  quote?: string;
}

interface DashboardNotification {
  _id: string;
  title?: string;
  message?: string;
  createdAt: string;
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

const statusCount = (stats: DashboardStats | null, id: string): number =>
  stats?.byStatus?.find((s) => s._id === id)?.count || 0;

const PRIORITY_WEIGHT: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };

function byDueThenPriority(a: DashboardTask, b: DashboardTask): number {
  const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
  const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
  if (ad !== bd) return ad - bd;
  return (PRIORITY_WEIGHT[a.priority ?? 'none'] ?? 4) - (PRIORITY_WEIGHT[b.priority ?? 'none'] ?? 4);
}

/** One task row: title + due stamp on the left, edit/delete on the right. */
function TaskRow({
  task,
  onEdit,
  onDelete,
  meta,
  badge,
}: {
  task: DashboardTask;
  onEdit: (task: DashboardTask) => void;
  onDelete: (task: DashboardTask) => void;
  meta: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <li>
      <div className="group hover:bg-card-hover flex w-full items-center gap-1.5 rounded-lg p-1.5 transition-colors">
        <button
          onClick={() => onEdit(task)}
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
            {meta}
            {badge}
          </span>
        </button>
        <span className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => onEdit(task)}
            aria-label={`Edit ${task.title}`}
            title="Edit task"
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-200/60 hover:text-gray-900 dark:hover:bg-gray-700/60 dark:hover:text-gray-100"
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(task)}
            aria-label={`Delete ${task.title}`}
            title="Delete task"
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:text-red-400"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </span>
      </div>
    </li>
  );
}

export default function Dashboard({ tasks, loading = false, onRefresh, onEditTask, onDeleteTask, onNewTask, onNavigate }: DashboardProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [digest, setDigest] = useState<DayDigest | null>(null);
  const [recentNotifications, setRecentNotifications] = useState<DashboardNotification[]>([]);
  const [showWeekly, setShowWeekly] = useState(false);
  const [onboardingHidden, setOnboardingHidden] = useState(
    () => localStorage.getItem(ONBOARDING_DISMISSED) === '1'
  );

  // The canonical list comes straight from the shell — capture happens in
  // the one global quick-capture modal (Q), so there is exactly one create
  // path and no local prepend/merge to keep in sync.
  const visibleTasks = tasks;

  // Tasks come from the App shell (single GET /tasks there). This loader
  // covers the Dashboard-owned endpoints only: stats + decoration.
  const load = useCallback(async () => {
    try {
      const statsRes = await getStats();
      setStats(statsRes.data as DashboardStats);
    } catch {
      // Read-only surface: a failed fetch falls through to empty states rather
      // than replacing the whole page with an error.
    }

    // Both of these are decoration — never let them gate the main render.
    try {
      const { data } = await aiAPI.generateDigest();
      setDigest(data as DayDigest);
    } catch {}
    try {
      const { data } = await getNotifications({ limit: 3 });
      const items: DashboardNotification[] = Array.isArray(data)
        ? (data as DashboardNotification[])
        : (((data as { items?: DashboardNotification[] } | null)?.items) ?? []);
      setRecentNotifications(items.slice(0, 3));
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);
  const openTasks = useMemo(
    () => visibleTasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled'),
    [visibleTasks]
  );

  /**
   * "What do I do today" ordering: every overdue task (oldest first), then
   * everything due today (earliest time first), then the next 3 open tasks by
   * deadline (undated work sinks last but still shows — including the item
   * just filed through Quick capture, so creates update immediately).
   */
  const upNext = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const overdue = openTasks
      .filter((t) => t.dueDate && new Date(t.dueDate) < startOfToday)
      .sort(byDueThenPriority);
    const dueToday = openTasks
      .filter((t) => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        return d >= startOfToday && d < startOfTomorrow;
      })
      .sort(byDueThenPriority);
    const shown = new Set([...overdue, ...dueToday].map((t) => t._id));
    const next = openTasks
      .filter((t) => !shown.has(t._id))
      .sort(byDueThenPriority)
      .slice(0, 3);
    return [...overdue, ...dueToday, ...next];
  }, [openTasks]);

  const upcomingDeadlines = useMemo(
    () =>
      visibleTasks
        .filter((t) => t.dueDate && t.status !== 'completed')
        .sort((a, b) => new Date(a.dueDate as string).getTime() - new Date(b.dueDate as string).getTime())
        .slice(0, 5),
    [visibleTasks]
  );

  const dueToday = openTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate).toDateString() === new Date().toDateString()
  ).length;

  // Activation checklist. Every step is derived from real data rather than a
  // stored flag, so it stays honest if a user deletes the thing they just made.
  const steps = useMemo<OnboardingStep[]>(() => {
    const has = (fn: (t: DashboardTask) => boolean) => visibleTasks.some(fn);
    return [
      { id: 'create', label: 'Create your first task', done: visibleTasks.length > 0, cta: 'New task', run: onNewTask },
      { id: 'due', label: 'Give a task a due date', done: has((t) => !!t.dueDate) },
      { id: 'subtasks', label: 'Break one into subtasks', done: has((t) => (t.subtasks?.length ?? 0) > 0) },
      { id: 'timer', label: 'Track time on a task', done: has((t) => (t.timeSpent ?? 0) > 0 || (t.timeSessions?.length ?? 0) > 0) },
      { id: 'complete', label: 'Finish something', done: statusCount(stats, 'completed') > 0 },
      { id: 'palette', label: 'Open the command palette', done: localStorage.getItem(PALETTE_USED_KEY) === '1', shortcut: 'mod+K' },
    ];
  }, [visibleTasks, stats, onNewTask]);

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
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5 p-4 pb-24 md:p-6">
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

          {/* Daily loop entry points — Today / Inbox / Weekly reset. */}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onNavigate('today')}>
              Open Today
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onNavigate('inbox')}>
              Triage Inbox
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowWeekly(true)}>
              Weekly reset
            </Button>
          </div>
        </Card>
      </motion.div>

      <motion.div variants={item}>
        <WeeklyResetBanner onOpen={() => setShowWeekly(true)} />
      </motion.div>
      <WeeklyReset open={showWeekly} onClose={() => setShowWeekly(false)} onNavigate={onNavigate} />

      {/* Quick capture — one entry point: the global Inbox modal (Q). */}
      <motion.div variants={item}>
        <Card padding="md">
          <p className="caption-upper mb-2">Quick capture</p>
          <button
            type="button"
            onClick={requestQuickCapture}
            className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg border border-gray-200 bg-card px-3.5 text-left text-sm text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
          >
            <Plus size={16} className="shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate">Type a task and press Enter…</span>
            <KbdShortcut keys={['Q']} />
          </button>
        </Card>
      </motion.div>

      {/* Up next — overdue first, then today, then the next 3 dated tasks. */}
      <motion.div variants={item}>
        <Card padding="md">
          <CardHeader
            eyebrow="Up next"
            title={upNext.length ? `${upNext.length} need${upNext.length === 1 ? 's' : ''} you` : 'Today is clear'}
            subtitle="Overdue first, then due today, then what's next. Decide overdue in Today."
            action={
              <Button variant="ghost" size="sm" onClick={() => onNavigate('today')}>
                Open Today
              </Button>
            }
          />
          {upNext.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<Clock size={20} />}
              title="Nothing queued up"
              description="Every open task is either done or has no deadline pressure."
              action={<Button size="sm" icon={<Plus size={14} />} onClick={onNewTask}>New task</Button>}
            />
          ) : (
            <ul className="space-y-1">
              {upNext.map((task) => (
                <TaskRow
                  key={task._id}
                  task={task}
                  onEdit={onEditTask}
                  onDelete={onDeleteTask}
                  meta={
                    task.dueDate ? (
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
                    ) : null
                  }
                  badge={<StatusBadge status={task.status} />}
                />
              ))}
            </ul>
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

      {/* NOTE: the old status-tile grid and the "Where the work sits"
          distribution panel lived here. Both duplicated the Insights page
          (status overview / priority mix), so they were cut — this page now
          answers only "what do I do today". The stats hook stays: the hero
          strip and the onboarding checklist still read from it. */}
      <motion.div variants={item} className="grid grid-cols-1 gap-5 lg:grid-cols-2">
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
                <TaskRow
                  key={task._id}
                  task={task}
                  onEdit={onEditTask}
                  onDelete={onDeleteTask}
                  meta={
                    task.dueDate ? (
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
                    ) : null
                  }
                  badge={<PriorityBadge priority={task.priority ?? 'none'} />}
                />
              ))}
            </ul>
          )}
        </Card>

        <CalendarWidget tasks={visibleTasks} />
      </motion.div>

      <motion.div variants={item}>
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
              {recentNotifications.map((n) => (
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
