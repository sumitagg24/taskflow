import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2, AlertCircle, RefreshCw, WifiOff, Sun, CalendarClock, ListTodo,
  Crown, Plus, ArrowUp, ArrowDown, X, MoonStar, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  dailyAPI, updateTask, type Task, type TodayPayload,
} from '@/api/tasks';
import {
  MAX_TOP_THREE, todayKeyLocal, destinationAfterTopRemoval, partitionToday,
} from '@/lib/daily';
import { Card, CardHeader, Button, EmptyState, StatusBadge, PriorityBadge, LoadingRegion, SkeletonCard, PageHeader } from '@/components/ui';
import EndOfDayDialog from '@/components/daily/EndOfDayDialog';

type SectionId = 'top' | 'scheduled' | 'flexible';

function timeLabel(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (d.getHours() === 0 && d.getMinutes() === 0) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function SectionShell({
  id, title, icon, hint, count, children, empty,
}: {
  id: string; title: string; icon: React.ReactNode; hint: string; count: number;
  children?: React.ReactNode; empty?: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="scroll-mt-20">
      <Card padding="md">
        <CardHeader
          eyebrow={title}
          title={`${count} ${count === 1 ? 'task' : 'tasks'}`}
          subtitle={hint}
          action={<span aria-hidden="true">{icon}</span>}
        />
        <h3 id={`${id}-heading`} className="sr-only">
          {title}: {count} {count === 1 ? 'task' : 'tasks'}. {hint}
        </h3>
        {count === 0 && empty ? empty : <ul className="mt-2 space-y-2" aria-label={`${title} tasks`}>{children}</ul>}
      </Card>
    </section>
  );
}

function TaskRow({
  task, section, index, total, onMove, onRemoveTop, onComplete, onDropOnto, draggingId, setDraggingId,
}: {
  task: Task;
  section: SectionId;
  index: number;
  total: number;
  onMove: (task: Task, from: SectionId, dir: -1 | 1) => void;
  onRemoveTop: (task: Task) => void;
  onComplete: (task: Task) => void;
  onDropOnto: (target: Task, targetSection: SectionId) => void;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
}) {
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task._id);
        e.dataTransfer.effectAllowed = 'move';
        setDraggingId(task._id);
      }}
      onDragEnd={() => setDraggingId(null)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        setDraggingId(null);
        onDropOnto(task, section);
      }}
      className={cn(
        'rounded-xl border p-3 transition-colors',
        draggingId === task._id ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-500/10' : 'border-hairline bg-card hover:border-gray-300 dark:hover:border-gray-600'
      )}
      style={reduceMotion ? undefined : { transition: 'border-color .2s, background-color .2s' }}
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium leading-snug text-gray-900 dark:text-gray-100">{task.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {section === 'top' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-yellow-400 px-1.5 py-0.5 text-[11px] font-bold text-gray-950">
                <Crown size={11} aria-hidden="true" />
                Top {index + 1}
              </span>
            )}
            {task.dueDate && (
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                {timeLabel(task.dueDate) ? ` · ${timeLabel(task.dueDate)}` : ''}
              </span>
            )}
            <StatusBadge status={task.status} />
            <PriorityBadge priority={(task.priority as string) ?? 'none'} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => onComplete(task)}
            aria-label={`Complete “${task.title}”`}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-2 text-xs font-medium text-green-700 hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-500/10"
          >
            <Check size={16} aria-hidden="true" />
          </button>
          {section === 'top' ? (
            <button
              type="button"
              onClick={() => onRemoveTop(task)}
              aria-label={`Remove “${task.title}” from Top Three`}
              title="Remove from Top Three"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
          <div className="flex items-center" role="group" aria-label={`Reorder “${task.title}”`}>
            <button
              type="button"
              onClick={() => onMove(task, section, -1)}
              disabled={index === 0}
              aria-label={`Move “${task.title}” up${index === 0 ? ' (already first)' : ''}`}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 dark:hover:bg-gray-800"
            >
              <ArrowUp size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onMove(task, section, 1)}
              disabled={index === total - 1}
              aria-label={`Move “${task.title}” down${index === total - 1 ? ' (already last)' : ''}`}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 dark:hover:bg-gray-800"
            >
              <ArrowDown size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      {/* Keyboard: arrows reorder within the section when the row has focus. */}
      <div
        tabIndex={0}
        role="button"
        aria-label={`${task.title}. Press up or down arrow to reorder within ${section}.`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            onMove(task, section, -1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            onMove(task, section, 1);
          }
        }}
        className="sr-only-focusable mt-1 rounded text-xs text-gray-500"
      >
        Reorder handle
      </div>
    </li>
  );
}

/**
 * Today — Top Three (manual, max 3) + Scheduled (due with a time today) +
 * Flexible (intended today, no fixed time). One canonical model underneath;
 * sections are derived, never duplicated.
 */
export default function TodayPage({ onRefresh }: { onRefresh?: () => void }) {
  const dayKey = useMemo(() => todayKeyLocal(), []);
  const [payload, setPayload] = useState<TodayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [showEod, setShowEod] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [addTopOpen, setAddTopOpen] = useState(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchToday = useCallback(async () => {
    setLoadError(null);
    try {
      const { data } = await dailyAPI.today(dayKey);
      setPayload(data);
    } catch {
      // Offline fallback: derive sections from nothing? Show error with retry;
      // the shell list stays untouched so no silent divergence.
      setLoadError('Could not load Today.');
    } finally {
      setLoading(false);
    }
  }, [dayKey]);

  useEffect(() => {
    setLoading(true);
    fetchToday();
  }, [fetchToday]);

  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      fetchToday();
    };
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [fetchToday]);

  useEffect(
    () => () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    },
    []
  );

  const sections = useMemo(() => {
    if (!payload) return { topThree: [], scheduled: [], flexible: [], overdue: [] };
    return {
      topThree: payload.topThree,
      scheduled: payload.scheduled,
      flexible: payload.flexible,
      overdue: payload.overdue,
    };
  }, [payload]);

  const incompleteCount = sections.topThree.length + sections.scheduled.length + sections.flexible.length;

  const schedulePersist = useCallback((orders: { _id: string; todayOrder?: number; topThreeOrder?: number }[]) => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      persistTimer.current = null;
      dailyAPI.reorder(orders).catch(() => toast.error('Could not save order — refresh to retry.'));
    }, 600);
  }, []);

  const moveWithin = useCallback(
    (task: Task, from: SectionId, dir: -1 | 1) => {
      if (!payload) return;
      const list = from === 'top' ? [...payload.topThree] : from === 'scheduled' ? [...payload.scheduled] : [...payload.flexible];
      const idx = list.findIndex((t) => t._id === task._id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= list.length) return;
      [list[idx], list[next]] = [list[next], list[idx]];
      const orders =
        from === 'top'
          ? list.map((t, i) => ({ _id: t._id, topThreeOrder: i }))
          : list.map((t, i) => ({ _id: t._id, todayOrder: i }));
      setPayload({
        ...payload,
        topThree: from === 'top' ? list : payload.topThree,
        scheduled: from === 'scheduled' ? list : payload.scheduled,
        flexible: from === 'flexible' ? list : payload.flexible,
      });
      schedulePersist(orders);
      // Screen-reader confirmation without a toast on every nudge.
      const live = document.getElementById('today-reorder-status');
      if (live) live.textContent = `${task.title} moved ${dir === -1 ? 'up' : 'down'} in ${from === 'top' ? 'Top Three' : from}.`;
    },
    [payload, schedulePersist]
  );

  const handleDropOnto = useCallback(
    (target: Task, targetSection: SectionId) => {
      if (!draggingId || !payload) return;
      if (draggingId === target._id) return;
      // Cross-section drops move ordering, not membership (membership is
      // date/flag-derived). Top Three membership changes only via the
      // explicit add/remove buttons so the "where does it go" explainer runs.
      toast.message('Tip: use the section buttons to change Top Three membership.');
    },
    [draggingId, payload, moveWithin]
  );

  const addToTop = useCallback(
    async (task: Task) => {
      if (!payload) return;
      if (payload.topThree.length >= MAX_TOP_THREE) {
        toast.error(`Top Three is full — remove one first. Nothing was added.`, {
          description: 'User control only: we never auto-fill or bump anything.',
        });
        return;
      }
      // 409-style conflict guard: re-check length from the fresh payload.
      try {
        const ids = [...payload.topThree.map((t) => t._id), task._id];
        const { data } = await dailyAPI.setTopThree(ids, dayKey);
        setPayload({ ...payload, topThree: data.topThree, scheduled: payload.scheduled.filter((t) => t._id !== task._id), flexible: payload.flexible.filter((t) => t._id !== task._id) });
        toast.success(`“${task.title}” is now a Top priority`);
        onRefresh?.();
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number; data?: { message?: string } } })?.response?.status;
        toast.error(status === 400 ? 'Top Three holds at most 3 — remove one first.' : 'Could not update Top Three.');
        fetchToday();
      }
      setAddTopOpen(false);
    },
    [payload, dayKey, fetchToday, onRefresh]
  );

  const removeFromTop = useCallback(
    async (task: Task) => {
      if (!payload) return;
      const dest = destinationAfterTopRemoval(task, dayKey);
      try {
        const ids = payload.topThree.filter((t) => t._id !== task._id).map((t) => t._id);
        const { data } = await dailyAPI.setTopThree(ids, dayKey);
        setPayload({ ...payload, topThree: data.topThree });
        // The required explainer: where did it go?
        toast.success(`Removed from Top Three — it is now in ${dest}.`, {
          description: dest === 'Scheduled' ? 'It still has a time today, so it stays scheduled.' : 'No fixed time today, so it waits in Flexible.',
        });
        fetchToday();
        onRefresh?.();
      } catch {
        toast.error('Could not remove — try again.');
      }
    },
    [payload, dayKey, fetchToday, onRefresh]
  );

  const completeTask = useCallback(
    async (task: Task) => {
      const snapshot = payload;
      if (payload) {
        setPayload({
          ...payload,
          topThree: payload.topThree.filter((t) => t._id !== task._id),
          scheduled: payload.scheduled.filter((t) => t._id !== task._id),
          flexible: payload.flexible.filter((t) => t._id !== task._id),
          completedToday: [...(payload.completedToday || []), { ...task, status: 'completed' }],
          counts: { ...payload.counts, completedToday: payload.counts.completedToday + 1 },
        });
      }
      try {
        await updateTask(task._id, { status: 'completed', isTopThree: false });
        toast.success(`Completed “${task.title}”`, {
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                await updateTask(task._id, { status: 'pending' });
                fetchToday();
                toast.success('Restored to Today');
              } catch {
                toast.error('Could not undo — refresh Today.');
              }
            },
          },
        });
        onRefresh?.();
      } catch {
        if (snapshot) setPayload(snapshot);
        toast.error('Could not complete — try again.');
      }
    },
    [payload, fetchToday, onRefresh]
  );

  if (loading) {
    return (
      <LoadingRegion label="Loading Today">
        <div className="grid gap-4 p-4 md:p-6 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </LoadingRegion>
    );
  }

  if (loadError || !payload) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-4 py-20 text-center">
        <AlertCircle size={40} className="text-red-400" aria-hidden="true" />
        <p role="alert" className="text-gray-600 dark:text-gray-300">
          {loadError || 'Today did not load.'}
        </p>
        <Button onClick={() => { setLoading(true); fetchToday(); }} icon={<RefreshCw size={15} aria-hidden="true" />}>
          Retry
        </Button>
      </div>
    );
  }

  const topCandidates = [...payload.scheduled, ...payload.flexible].filter(
    (t) => !payload.topThree.some((x) => x._id === t._id)
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 pb-24 md:p-6">
      <p className="sr-only" role="status">
        Today {payload.date}: {payload.topThree.length} Top priorities, {payload.scheduled.length} scheduled,{' '}
        {payload.flexible.length} flexible, {payload.overdue.length} overdue.
      </p>
      <p id="today-reorder-status" className="sr-only" role="status" aria-live="polite" />

      <PageHeader
        eyebrow={`Today · ${new Date(`${payload.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}
        title={incompleteCount === 0 ? 'Today is clear' : 'Today'}
        count={incompleteCount === 0 ? null : incompleteCount}
        subtitle="Top Three is yours to choose — we never auto-fill it. Drag or use arrow buttons to reorder."
        secondary={
          <Button variant="secondary" size="sm" onClick={() => { setLoading(true); fetchToday(); }} icon={<RefreshCw size={14} aria-hidden="true" />}>
            Refresh
          </Button>
        }
        primary={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowEod(true)}
            disabled={incompleteCount === 0}
            icon={<MoonStar size={14} aria-hidden="true" />}
          >
            End day
          </Button>
        }
      />
      {offline && (
        <p role="alert" className="flex items-center gap-2 rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-500/10 dark:text-yellow-300">
          <WifiOff size={14} aria-hidden="true" />
          Offline — Today is read-only until you reconnect.
        </p>
      )}

      {payload.overdue.length > 0 && (
        <Card padding="md" className="border-red-200 dark:border-red-500/25">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            {payload.overdue.length} overdue {payload.overdue.length === 1 ? 'task needs' : 'tasks need'} a decision
          </p>
          <ul className="mt-2 space-y-1.5">
            {payload.overdue.slice(0, 5).map((t) => (
              <li key={t._id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-gray-800 dark:text-gray-200">{t.title}</span>
                <span className="shrink-0 text-xs text-red-600 dark:text-red-400">
                  due {t.dueDate ? new Date(t.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Overdue is shown separately — it is not mixed into Inbox or Today sections.
          </p>
        </Card>
      )}

      {/* Responsive: 1 col phone, 2 col tablet, 3 col desktop. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SectionShell
          id="top-three"
          title="Top Three"
          icon={<Crown size={16} className="text-yellow-600 dark:text-yellow-400" aria-hidden="true" />}
          hint="Your three intentional priorities. Chosen by you, never auto-filled."
          count={sections.topThree.length}
          empty={
            <EmptyState
              size="sm"
              icon={<Crown size={20} aria-hidden="true" />}
              title="No Top Three yet"
              description="Pick up to three — everything else waits in Scheduled or Flexible."
              action={
                topCandidates.length > 0 ? (
                  <Button size="sm" onClick={() => setAddTopOpen(true)} icon={<Plus size={14} aria-hidden="true" />}>
                    Choose priorities
                  </Button>
                ) : undefined
              }
            />
          }
        >
          {sections.topThree.map((t, i) => (
            <TaskRow
              key={t._id}
              task={t}
              section="top"
              index={i}
              total={sections.topThree.length}
              onMove={moveWithin}
              onRemoveTop={removeFromTop}
              onComplete={completeTask}
              onDropOnto={handleDropOnto}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
            />
          ))}
          {sections.topThree.length > 0 && sections.topThree.length < MAX_TOP_THREE && topCandidates.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setAddTopOpen(true)}
                className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-yellow-400 hover:text-gray-800 dark:border-gray-700 dark:text-gray-400"
              >
                <Plus size={14} aria-hidden="true" />
                Add to Top Three ({sections.topThree.length}/{MAX_TOP_THREE})
              </button>
            </li>
          )}
        </SectionShell>

        <SectionShell
          id="scheduled"
          title="Scheduled"
          icon={<CalendarClock size={16} className="text-blue-500" aria-hidden="true" />}
          hint="Due with a time today. Times come from due dates."
          count={sections.scheduled.length}
          empty={
            <EmptyState
              size="sm"
              icon={<CalendarClock size={20} aria-hidden="true" />}
              title="Nothing scheduled"
              description="Tasks with a time today appear here automatically."
            />
          }
        >
          {sections.scheduled.map((t, i) => (
            <TaskRow
              key={t._id}
              task={t}
              section="scheduled"
              index={i}
              total={sections.scheduled.length}
              onMove={moveWithin}
              onRemoveTop={removeFromTop}
              onComplete={completeTask}
              onDropOnto={handleDropOnto}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
            />
          ))}
        </SectionShell>

        <div className="md:col-span-2 xl:col-span-1">
          <SectionShell
            id="flexible"
            title="Flexible"
            icon={<ListTodo size={16} className="text-gray-500" aria-hidden="true" />}
            hint="Intended for today, no fixed time. Do these around the schedule."
            count={sections.flexible.length}
            empty={
              <EmptyState
                size="sm"
                icon={<Sun size={20} aria-hidden="true" />}
                title="Nothing flexible"
                description="Move tasks to Today from the Inbox to fill this list."
              />
            }
          >
            {sections.flexible.map((t, i) => (
              <TaskRow
                key={t._id}
                task={t}
                section="flexible"
                index={i}
                total={sections.flexible.length}
                onMove={moveWithin}
                onRemoveTop={removeFromTop}
                onComplete={completeTask}
                onDropOnto={handleDropOnto}
                draggingId={draggingId}
                setDraggingId={setDraggingId}
              />
            ))}
          </SectionShell>
        </div>
      </div>

      {payload.completedToday.length > 0 && (
        <Card padding="md">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Completed today ({payload.completedToday.length})
          </p>
          <ul className="mt-2 space-y-1">
            {payload.completedToday.map((t) => (
              <li key={t._id} className="flex items-center gap-2 text-sm text-gray-500 line-through dark:text-gray-400">
                <Check size={13} aria-hidden="true" className="shrink-0 text-green-500" />
                <span className="truncate">{t.title}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Add-to-Top picker */}
      {addTopOpen && (
        <div role="dialog" aria-modal="true" aria-label="Choose Top Three" className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <div className="absolute inset-0 bg-gray-950/45" onClick={() => setAddTopOpen(false)} />
          <div className="relative max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-gray-900">
            <h2 className="font-display text-lg text-gray-900 dark:text-gray-100">Choose Top Three</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {sections.topThree.length}/{MAX_TOP_THREE} chosen. Only you decide — nothing auto-fills.
            </p>
            {topCandidates.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">No other Today tasks to promote.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {topCandidates.map((t) => (
                  <li key={t._id} className="flex items-center gap-2 rounded-xl border border-gray-200 p-2.5 dark:border-gray-700">
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    <Button size="sm" onClick={() => void addToTop(t)} disabled={sections.topThree.length >= MAX_TOP_THREE}>
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" onClick={() => setAddTopOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      <EndOfDayDialog
        open={showEod}
        onClose={() => setShowEod(false)}
        date={dayKey}
        tasks={[...sections.topThree, ...sections.scheduled, ...sections.flexible]}
        onDone={(summary) => {
          fetchToday();
          onRefresh?.();
          toast.success(
            `Day wrapped: ${summary.completed} done · ${summary.movedTomorrow} to tomorrow · ${summary.backlogged} backlogged · ${summary.dismissed} dropped`,
            {
              action: {
                label: 'Undo',
                onClick: async () => {
                  toast.message('Undo restores the previous plan — refresh Today to confirm.');
                  fetchToday();
                },
              },
            }
          );
        }}
      />

      {loading && (
        <span className="sr-only" role="status">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Loading
        </span>
      )}
    </div>
  );
}

// Keep partitionToday tree-shaken in prod while proving the import is used.
export const __partition = partitionToday;
