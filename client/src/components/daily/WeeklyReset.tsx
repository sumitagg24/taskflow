import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarCheck2, Inbox as InboxIcon, AlertTriangle, PartyPopper, ArrowRight, X, Loader2, RefreshCw, WifiOff,
} from 'lucide-react';
import { dailyAPI, updateTask, type Task } from '@/api/tasks';
import { addDaysKey, todayKeyLocal, formatDayKey } from '@/lib/daily';
import { Modal } from '@/components/ui/Modal';
import { Card, CardHeader, Button, EmptyState, LoadingRegion, SkeletonCard } from '@/components/ui';

const DISMISS_KEY = 'taskflow:weekly-reset-dismissed';

interface ReviewPayload {
  inbox: { count: number; sample: Task[]; tasks: Task[] };
  overdue: Task[];
  overdueCount: number;
  completedThisWeek: Task[];
  completedCount: number;
  nextWeekCandidates: Task[];
  dismissedAt: string | null;
}

/**
 * Weekly reset — lightweight, optional, dismissible. Four calm steps, no
 * streaks, no scores, no pressure: inbox → overdue → recap → next week.
 */
export default function WeeklyReset({
  open, onClose, onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate?: (section: string) => void;
}) {
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const fetchReview = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const { data: payload } = await dailyAPI.weeklyReview();
      setData(payload);
      setPicked(new Set());
    } catch {
      setError('Could not load the weekly review.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchReview();
  }, [open, fetchReview]);

  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      if (open) fetchReview();
    };
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [open, fetchReview]);

  const togglePick = (id: string) => {
    setPicked((prev) => {
      if (prev.size >= 5 && !prev.has(id)) {
        toast.message('Keep next week light — up to 5 priorities.');
        return prev;
      }
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveNextWeek = async () => {
    if (picked.size === 0 || saving) return;
    setSaving(true);
    try {
      const monday = addDaysKey(todayKeyLocal(), ((8 - new Date().getDay()) % 7) || 7);
      await Promise.all(
        [...picked].map((id) =>
          updateTask(id, { plannedFor: new Date(`${monday}T12:00:00`).toISOString(), inbox: false })
        )
      );
      toast.success(`${picked.size} ${picked.size === 1 ? 'priority' : 'priorities'} set for next week (${formatDayKey(monday)})`);
      onClose();
    } catch {
      toast.error('Could not save — try again.');
    } finally {
      setSaving(false);
    }
  };

  const dismiss = async () => {
    try {
      localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    } catch { /* storage unavailable — server dismissal still counts */ }
    try {
      await dailyAPI.dismissWeekly();
    } catch { /* optional — local dismissal is enough */ }
    onClose();
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Weekly reset"
      subtitle="Optional, unhurried, no streaks. Four steps whenever you want one."
      size="xl"
    >
      {loading ? (
        <LoadingRegion label="Loading weekly review">
          <div className="grid gap-3 sm:grid-cols-2">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
        </LoadingRegion>
      ) : error || !data ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p role="alert" className="text-sm text-gray-600 dark:text-gray-300">
            {error || 'Review did not load.'}
          </p>
          <Button onClick={fetchReview} icon={<RefreshCw size={14} aria-hidden="true" />}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {offline && (
            <p role="alert" className="flex items-center gap-2 rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-500/10 dark:text-yellow-300">
              <WifiOff size={14} aria-hidden="true" />
              Offline — showing last loaded review.
            </p>
          )}
          <ol className="grid gap-3 sm:grid-cols-2">
            <li>
              <Card padding="md" className="h-full">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <InboxIcon size={13} aria-hidden="true" /> 1 · Inbox
                </p>
                <p className="font-display mt-1 text-2xl text-gray-900 dark:text-gray-100" aria-live="polite">
                  {data.inbox.count}
                </p>
                <p className="text-xs text-gray-500">
                  {data.inbox.count === 0 ? 'Clear — nice.' : 'Untriaged. Even five minutes helps.'}
                </p>
                {data.inbox.sample.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {data.inbox.sample.slice(0, 3).map((t) => (
                      <li key={t._id} className="truncate text-xs text-gray-600 dark:text-gray-300">
                        · {t.title}
                      </li>
                    ))}
                  </ul>
                )}
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => { onClose(); onNavigate?.('inbox'); }}>
                  Triage Inbox <ArrowRight size={13} aria-hidden="true" />
                </Button>
              </Card>
            </li>
            <li>
              <Card padding="md" className="h-full">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <AlertTriangle size={13} aria-hidden="true" /> 2 · Overdue
                </p>
                <p className="font-display mt-1 text-2xl text-gray-900 dark:text-gray-100">{data.overdueCount}</p>
                <p className="text-xs text-gray-500">Decide: reschedule, backlog, or drop — deliberately.</p>
                {data.overdue.slice(0, 3).map((t) => (
                  <p key={t._id} className="mt-1 truncate text-xs text-gray-600 dark:text-gray-300">
                    · {t.title}
                  </p>
                ))}
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => { onClose(); onNavigate?.('today'); }}>
                  Review Today <ArrowRight size={13} aria-hidden="true" />
                </Button>
              </Card>
            </li>
            <li>
              <Card padding="md" className="h-full">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <PartyPopper size={13} aria-hidden="true" /> 3 · Done this week
                </p>
                <p className="font-display mt-1 text-2xl text-gray-900 dark:text-gray-100">{data.completedCount}</p>
                <p className="text-xs text-gray-500">A plain recap — not a score.</p>
                {data.completedThisWeek.slice(0, 3).map((t) => (
                  <p key={t._id} className="mt-1 truncate text-xs text-gray-600 line-through dark:text-gray-400">
                    · {t.title}
                  </p>
                ))}
                {data.completedCount === 0 && (
                  <p className="mt-2 text-xs italic text-gray-400">Quiet weeks count too.</p>
                )}
              </Card>
            </li>
            <li>
              <Card padding="md" className="h-full">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <CalendarCheck2 size={13} aria-hidden="true" /> 4 · Next week
                </p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                  Pick up to 5 — or skip entirely.
                </p>
                {data.nextWeekCandidates.length === 0 ? (
                  <p className="mt-2 text-xs text-gray-500">Nothing waiting — add work first.</p>
                ) : (
                  <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                    {data.nextWeekCandidates.slice(0, 8).map((t) => {
                      const on = picked.has(t._id);
                      return (
                        <li key={t._id}>
                          <button
                            type="button"
                            onClick={() => togglePick(t._id)}
                            aria-pressed={on}
                            className={
                              on
                                ? 'flex min-h-[44px] w-full items-center gap-2 rounded-lg bg-yellow-400 px-2.5 text-left text-xs font-semibold text-gray-950'
                                : 'flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-gray-200 px-2.5 text-left text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'
                            }
                          >
                            <span aria-hidden="true">{on ? '✓' : '○'}</span>
                            <span className="truncate">{t.title}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="mt-1 text-[11px] text-gray-400" aria-live="polite">
                  {picked.size} picked
                </p>
              </Card>
            </li>
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
            <Button variant="ghost" onClick={() => void dismiss()} icon={<X size={14} aria-hidden="true" />}>
              Dismiss (no pressure)
            </Button>
            <div className="flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin text-gray-400" aria-hidden="true" />}
              <Button onClick={() => void saveNextWeek()} loading={saving} disabled={picked.size === 0}>
                Set next week ({picked.size})
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function isWeeklyDismissedLocal(withinDays = 7): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = new Date(raw).getTime();
    if (Number.isNaN(at)) return false;
    return Date.now() - at < withinDays * 86_400_000;
  } catch {
    return false;
  }
}

/** Small banner entry point for the Dashboard (optional, dismissible). */
export function WeeklyResetBanner({ onOpen }: { onOpen: () => void }) {
  if (isWeeklyDismissedLocal()) return null;
  const isMonday = new Date().getDay() === 1;
  if (!isMonday) return null;
  return (
    <Card padding="md" className="border-yellow-200/70 bg-yellow-50/40 dark:border-yellow-500/15 dark:bg-yellow-500/[0.04]">
      <div className="flex flex-wrap items-center gap-3">
        <CalendarCheck2 size={18} className="shrink-0 text-yellow-600 dark:text-yellow-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Monday? Take a 2-minute weekly reset.</p>
          <p className="text-xs text-gray-500">Inbox, overdue, recap, next week — optional, no streaks.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={() => { try { localStorage.setItem(DISMISS_KEY, new Date().toISOString()); } catch {} }}>
            Not now
          </Button>
          <Button size="sm" onClick={onOpen}>
            Start reset
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function WeeklyResetEmpty() {
  return (
    <EmptyState
      size="sm"
      icon={<CalendarCheck2 size={20} aria-hidden="true" />}
      title="No review needed"
      description="When work piles up, the weekly reset collects it calmly."
    />
  );
}
