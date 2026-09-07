import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Inbox as InboxIcon, Loader2, AlertCircle, RefreshCw, WifiOff,
  CalendarDays, Flag, FolderInput, Sun, Archive, Trash2, CheckSquare, Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { dailyAPI, updateTask, deleteTask, restoreTask, type Task } from '@/api/tasks';
import { Card, CardHeader, Button, EmptyState, StatusBadge, PriorityBadge, LoadingRegion, SkeletonCard } from '@/components/ui';

const PRIORITIES = ['critical', 'high', 'medium', 'low', 'none'] as const;
const CATEGORIES = ['work', 'personal', 'college', 'projects', 'fitness', 'shopping', 'finance', 'learning', 'uncategorized'];

/**
 * Inbox — persistent untriaged tasks. Visually distinct from overdue /
 * scheduled: every row carries an "Inbox" badge and the header states the
 * overdue count separately so the two are never confused.
 */
export default function InboxPage({ onRefresh }: { onRefresh?: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const fetchInbox = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const { data } = await dailyAPI.inbox();
      setTasks(data.tasks);
      setOverdueCount(data.overdueCount);
      setSelected((prev) => {
        const visible = new Set(data.tasks.map((t) => t._id));
        const next = new Set<string>();
        for (const id of prev) if (visible.has(id)) next.add(id);
        return next;
      });
    } catch {
      setLoadError('Could not load your Inbox.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      fetchInbox();
    };
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [fetchInbox]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = tasks.length > 0 && selected.size === tasks.length;
  const toggleAll = useCallback(() => {
    setSelected((prev) => (prev.size === tasks.length ? new Set() : new Set(tasks.map((t) => t._id))));
  }, [tasks]);

  const ids = useMemo(() => [...selected], [selected]);

  const runTriage = useCallback(
    async (updates: Record<string, unknown>, opts?: { moveToToday?: boolean; label: string }) => {
      if (ids.length === 0 || busy) return;
      if (!navigator.onLine) {
        toast.error('Offline — reconnect to triage.');
        return;
      }
      setBusy(true);
      const snapshot = tasks;
      // Optimistic: drop triaged rows when they leave the inbox.
      const leaving = !opts || (updates.inbox === false || opts.moveToToday || (updates as { inbox?: boolean }).inbox === false);
      if (leaving || opts?.moveToToday) {
        setTasks((prev) => prev.filter((t) => !selected.has(t._id)));
        setSelected(new Set());
      }
      try {
        const { data } = await dailyAPI.triage(ids, updates, { moveToToday: opts?.moveToToday });
        toast.success(opts?.label || `Triaged ${data.count} ${data.count === 1 ? 'task' : 'tasks'}`);
        onRefresh?.();
        fetchInbox();
      } catch (err: unknown) {
        setTasks(snapshot);
        const status = (err as { response?: { status?: number } })?.response?.status;
        toast.error(status === 409 ? 'Something changed elsewhere — refreshed, try again.' : 'Triage failed — nothing moved.');
        fetchInbox();
      } finally {
        setBusy(false);
      }
    },
    [ids, busy, tasks, selected, onRefresh, fetchInbox]
  );

  const moveToToday = useCallback(() => {
    void runTriage({ status: 'pending' }, { moveToToday: true, label: `Moved ${ids.length} to Today` });
  }, [runTriage, ids.length]);

  const setPriority = useCallback(
    (priority: string) => {
      void runTriage({ priority }, { label: `Set ${ids.length} to ${priority}` });
    },
    [runTriage, ids.length]
  );

  const assignProject = useCallback(
    (category: string) => {
      void runTriage({ category }, { label: `Moved ${ids.length} to ${category}` });
    },
    [runTriage, ids.length]
  );

  const assignDate = useCallback(
    (dateKey: string | null) => {
      void runTriage(
        { dueDate: dateKey ? new Date(`${dateKey}T12:00:00`).toISOString() : null },
        { label: dateKey ? `Dated ${ids.length} for ${dateKey}` : `Cleared dates for ${ids.length}` }
      );
    },
    [runTriage, ids.length]
  );

  const archiveSelected = useCallback(async () => {
    if (ids.length === 0 || busy) return;
    setBusy(true);
    const snapshot = tasks;
    setTasks((prev) => prev.map((t) => (selected.has(t._id) ? { ...t, status: 'backlog', inbox: false } : t)).filter((t) => !selected.has(t._id)));
    setSelected(new Set());
    try {
      await dailyAPI.triage(ids, { status: 'backlog' });
      toast.success(`Archived ${ids.length} to backlog`);
      onRefresh?.();
      fetchInbox();
    } catch {
      setTasks(snapshot);
      toast.error('Archive failed — nothing moved.');
    } finally {
      setBusy(false);
    }
  }, [ids, busy, tasks, selected, onRefresh, fetchInbox]);

  const deleteSelected = useCallback(async () => {
    if (ids.length === 0 || busy) return;
    setBusy(true);
    const snapshot = tasks;
    const removed = tasks.filter((t) => selected.has(t._id));
    setTasks((prev) => prev.filter((t) => !selected.has(t._id)));
    setSelected(new Set());
    try {
      await Promise.all(ids.map((id) => deleteTask(id)));
      toast.success(`Moved ${ids.length} to Trash`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            const results = await Promise.allSettled(ids.map((id) => restoreTask(id)));
            const ok = results.filter((r) => r.status === 'fulfilled').length;
            if (ok === ids.length) toast.success('Restored');
            else toast.error(`Restored ${ok} of ${ids.length} — the rest are in Trash`);
            fetchInbox();
            onRefresh?.();
          },
        },
      });
      onRefresh?.();
    } catch {
      setTasks(snapshot);
      toast.error('Delete failed — nothing moved.');
    } finally {
      setBusy(false);
    }
  }, [ids, busy, tasks, selected, fetchInbox, onRefresh]);

  const completeOne = useCallback(
    async (task: Task) => {
      try {
        await updateTask(task._id, { status: 'completed', inbox: false });
        setTasks((prev) => prev.filter((t) => t._id !== task._id));
        toast.success(`Completed “${task.title}”`, {
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                await updateTask(task._id, { status: 'pending', inbox: true });
                fetchInbox();
                toast.success('Restored to Inbox');
              } catch {
                toast.error('Could not undo — check Inbox.');
              }
            },
          },
        });
        onRefresh?.();
      } catch {
        toast.error('Could not complete — try again.');
      }
    },
    [fetchInbox, onRefresh]
  );

  if (loading) {
    return (
      <LoadingRegion label="Loading your Inbox">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 lg:p-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </LoadingRegion>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-4 py-20 text-center">
        <AlertCircle size={40} className="text-red-400" aria-hidden="true" />
        <p role="alert" className="text-gray-600 dark:text-gray-300">
          {loadError}
        </p>
        <Button onClick={fetchInbox} icon={<RefreshCw size={15} aria-hidden="true" />}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 pb-24 md:p-6">
      <p className="sr-only" role="status">
        Inbox: {tasks.length} untriaged {tasks.length === 1 ? 'task' : 'tasks'}
        {overdueCount > 0 ? `, plus ${overdueCount} overdue elsewhere (not in Inbox)` : ''}.
      </p>

      <Card padding="lg">
        <CardHeader
          eyebrow="Inbox"
          title={tasks.length ? `${tasks.length} to triage` : 'Inbox zero'}
          subtitle={
            overdueCount > 0
              ? `${overdueCount} overdue ${overdueCount === 1 ? 'task lives' : 'tasks live'} outside the Inbox — not mixed in here.`
              : 'Untriaged quick captures only — scheduled and overdue work lives elsewhere.'
          }
          action={
            <Button variant="secondary" size="sm" onClick={fetchInbox} icon={<RefreshCw size={14} aria-hidden="true" />}>
              Refresh
            </Button>
          }
        />
        {offline && (
          <p role="alert" className="mt-3 flex items-center gap-2 rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-500/10 dark:text-yellow-300">
            <WifiOff size={14} aria-hidden="true" />
            Offline — triage is paused until you reconnect. Your Inbox is shown as last seen.
          </p>
        )}
        {tasks.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={toggleAll}
              aria-pressed={allSelected}
              aria-label={allSelected ? 'Deselect all Inbox tasks' : 'Select all Inbox tasks'}
              className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {allSelected ? <CheckSquare size={17} aria-hidden="true" /> : <Square size={17} aria-hidden="true" />}
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
              {selected.size > 0 ? `${selected.size} selected` : 'Pick tasks to triage in bulk'}
            </span>
          </div>
        )}
      </Card>

      {tasks.length === 0 ? (
        <EmptyState
          icon={<InboxIcon size={22} aria-hidden="true" />}
          title="Inbox is clear"
          description="Quick captures land here with just a title. Press Q anywhere to capture the next thing."
        />
      ) : (
        <ul className="space-y-2" aria-label="Untriaged Inbox tasks">
          {tasks.map((task) => {
            const checked = selected.has(task._id);
            return (
              <li key={task._id}>
                <Card
                  padding="md"
                  className={cn('transition-colors', checked && 'ring-2 ring-yellow-400')}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggle(task._id)}
                      aria-pressed={checked}
                      aria-label={checked ? `Deselect “${task.title}”` : `Select “${task.title}” for bulk triage`}
                      className={cn(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors',
                        checked
                          ? 'border-yellow-400 bg-yellow-400 text-gray-950'
                          : 'border-gray-300 hover:border-yellow-400 dark:border-gray-600'
                      )}
                    >
                      {checked && <CheckSquare size={14} aria-hidden="true" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-gray-900 dark:text-gray-100">{task.title}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-md bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300">
                          <InboxIcon size={11} aria-hidden="true" />
                          Inbox · untriaged
                        </span>
                        <StatusBadge status={task.status} />
                        <PriorityBadge priority={(task.priority as string) ?? 'none'} />
                        {task.dueDate && (
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">
                            Due {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => void completeOne(task)} aria-label={`Complete “${task.title}”`}>
                        Done
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* Bulk triage bar — sticky above the phone tab bar, static on desktop. */}
      {selected.size > 0 && (
        <div
          role="toolbar"
          aria-label={`Bulk triage ${selected.size} tasks`}
          className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-xl backdrop-blur md:sticky md:inset-auto md:bottom-4 dark:border-gray-700 dark:bg-gray-900/95"
        >
          <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400" aria-live="polite">
            {selected.size} selected — triage clears them from the Inbox (no copies, no silent deletes).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={moveToToday} loading={busy} icon={<Sun size={14} aria-hidden="true" />}>
              Move to Today
            </Button>
            <label className="flex min-h-[44px] items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <CalendarDays size={14} aria-hidden="true" />
              <span className="sr-only">Assign date to selected</span>
              <input
                type="date"
                aria-label="Assign date to selected tasks"
                className="h-9 rounded-lg border border-gray-200 bg-transparent px-2 text-xs dark:border-gray-700"
                onChange={(e) => {
                  if (e.target.value) assignDate(e.target.value);
                  e.target.value = '';
                }}
              />
            </label>
            <label className="flex min-h-[44px] items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <FolderInput size={14} aria-hidden="true" />
              <span className="sr-only">Assign project to selected</span>
              <select
                aria-label="Assign project to selected tasks"
                defaultValue=""
                className="h-9 rounded-lg border border-gray-200 bg-transparent px-2 text-xs dark:border-gray-700"
                onChange={(e) => {
                  if (e.target.value) assignProject(e.target.value);
                  e.target.value = '';
                }}
              >
                <option value="" disabled>
                  Project…
                </option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-h-[44px] items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <Flag size={14} aria-hidden="true" />
              <span className="sr-only">Set priority for selected</span>
              <select
                aria-label="Set priority for selected tasks"
                defaultValue=""
                className="h-9 rounded-lg border border-gray-200 bg-transparent px-2 text-xs dark:border-gray-700"
                onChange={(e) => {
                  if (e.target.value) setPriority(e.target.value);
                  e.target.value = '';
                }}
              >
                <option value="" disabled>
                  Priority…
                </option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="secondary" size="sm" onClick={() => void archiveSelected()} disabled={busy} icon={<Archive size={14} aria-hidden="true" />}>
              Backlog
            </Button>
            <Button variant="danger" size="sm" onClick={() => void deleteSelected()} disabled={busy} icon={<Trash2 size={14} aria-hidden="true" />}>
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Re-exported for tests that import the motion wrapper name.
export const InboxMotion = motion.div;
