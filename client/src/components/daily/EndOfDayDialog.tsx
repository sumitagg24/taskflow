import { useEffect, useMemo, useState } from 'react';
import { MoonStar, Loader2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { dailyAPI, updateTask, type Task, type ResolveSummary } from '@/api/tasks';
import { RESOLVE_LABELS, type ResolveAction, addDaysKey, formatDayKey } from '@/lib/daily';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface RowState {
  task: Task;
  action: ResolveAction;
  date?: string;
}

/**
 * End-of-day resolution — every incomplete Today task gets a deliberate
 * disposition. Never duplicates (no copies are made) and never silently
 * discards (delete is not an option; "no longer needed" = cancelled).
 */
export default function EndOfDayDialog({
  open,
  onClose,
  date,
  tasks,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  tasks: Task[];
  onDone?: (summary: ResolveSummary, previous: Record<string, unknown>[]) => void;
}) {
  const tomorrow = useMemo(() => addDaysKey(date, 1), [date]);
  const [rows, setRows] = useState<RowState[]>([]);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ResolveSummary | null>(null);
  const [previous, setPrevious] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    if (open) {
      setRows(tasks.map((t) => ({ task: t, action: 'tomorrow' as ResolveAction })));
      setSummary(null);
      setPrevious([]);
      setBusy(false);
    }
  }, [open, tasks]);

  const setRow = (id: string, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r) => (r.task._id === id ? { ...r, ...patch } : r)));
  };

  const setAll = (action: ResolveAction) => {
    setRows((prev) => prev.map((r) => ({ ...r, action })));
  };

  const submit = async () => {
    if (rows.length === 0 || busy) return;
    if (!navigator.onLine) {
      toast.error('Offline — reconnect to wrap the day.');
      return;
    }
    for (const r of rows) {
      if (r.action === 'date' && !r.date) {
        toast.error(`Choose a date for “${r.task.title}”.`);
        return;
      }
    }
    setBusy(true);
    try {
      const { data } = await dailyAPI.resolve(
        rows.map((r) => ({ taskId: r.task._id, action: r.action, date: r.date })),
        date
      );
      setSummary(data.summary);
      setPrevious(data.previous);
      onDone?.(data.summary, data.previous);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(status === 409 ? 'Something changed — refresh Today and try again.' : 'Could not wrap the day — nothing moved.');
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (previous.length === 0) return;
    setBusy(true);
    try {
      // Explicit restore of the exact previous plan (no guessing).
      await Promise.all(
        previous.map((p) => {
          const prev = p as { taskId: string; status: string; plannedFor: string | null; isTopThree: boolean; topThreeOrder: number };
          return updateTask(prev.taskId, {
            status: prev.status,
            plannedFor: prev.plannedFor,
            isTopThree: prev.isTopThree,
            topThreeOrder: prev.topThreeOrder,
          });
        })
      );
      toast.success('Undone — yesterday’s plan is back.');
      onClose();
    } catch {
      toast.error('Undo failed — refresh Today to check.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Wrap up today"
      subtitle={`${formatDayKey(date)} · ${tasks.length} incomplete ${tasks.length === 1 ? 'task needs' : 'tasks need'} a deliberate next step.`}
      size="lg"
    >
      {summary ? (
        <div className="space-y-4 text-center">
          <p role="status" className="mx-auto max-w-md text-[15px] leading-relaxed text-gray-700 dark:text-gray-200">
            Done: <strong>{summary.completed}</strong> · to tomorrow: <strong>{summary.movedTomorrow}</strong> ·{' '}
            scheduled: <strong>{summary.scheduled}</strong> · backlogged: <strong>{summary.backlogged}</strong> ·{' '}
            dropped: <strong>{summary.dismissed}</strong>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Nothing was duplicated or silently discarded — every task has an explicit home.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="secondary" onClick={() => void undo()} disabled={busy || previous.length === 0} icon={<Undo2 size={15} aria-hidden="true" />}>
              Undo
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">Nothing incomplete — enjoy the clear day.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Apply one action to all">
            <span className="w-full text-xs font-medium text-gray-500">All at once:</span>
            {(['tomorrow', 'backlog', 'complete'] as ResolveAction[]).map((a) => (
              <Button key={a} variant="ghost" size="sm" onClick={() => setAll(a)}>
                All → {RESOLVE_LABELS[a].toLowerCase()}
              </Button>
            ))}
          </div>
          <ul className="max-h-[50dvh] space-y-2 overflow-y-auto pr-0.5">
            {rows.map((r) => (
              <li key={r.task._id} className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{r.task.title}</p>
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {(['tomorrow', 'date', 'backlog', 'no-longer-needed', 'complete'] as ResolveAction[]).map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setRow(r.task._id, { action: a })}
                      aria-pressed={r.action === a}
                      className={
                        r.action === a
                          ? 'min-h-[44px] rounded-lg bg-yellow-400 px-2 py-1.5 text-xs font-semibold text-gray-950'
                          : 'min-h-[44px] rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                      }
                    >
                      {a === 'tomorrow' ? `Tomorrow (${formatDayKey(tomorrow)})` : RESOLVE_LABELS[a]}
                    </button>
                  ))}
                </div>
                {r.action === 'date' && (
                  <label className="mt-2 block text-xs text-gray-600 dark:text-gray-300">
                    <span className="mb-1 block font-medium">Move to</span>
                    <input
                      type="date"
                      value={r.date ?? ''}
                      min={tomorrow}
                      onChange={(e) => setRow(r.task._id, { date: e.target.value })}
                      className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700"
                    />
                  </label>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Later
            </Button>
            <Button onClick={() => void submit()} loading={busy} icon={<MoonStar size={15} aria-hidden="true" />}>
              {busy ? 'Wrapping…' : `Wrap ${rows.length} ${rows.length === 1 ? 'task' : 'tasks'}`}
            </Button>
          </div>
          {busy && (
            <p className="flex items-center justify-center gap-2 text-xs text-gray-500" role="status">
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              Saving every decision…
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
