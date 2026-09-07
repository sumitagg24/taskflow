import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, Plus, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { dailyAPI, type StarterTemplate } from '@/api/tasks';
import { Card, Button, EmptyState } from '@/components/ui';

/**
 * Starter templates — onboarding accelerators only. Each one creates ORDINARY
 * tasks (same model, same categories/tags); there are no special modes.
 */
export default function StarterTemplates({ onApplied }: { onApplied?: () => void }) {
  const [starters, setStarters] = useState<StarterTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const { data } = await dailyAPI.starters();
      setStarters(data.starters);
    } catch {
      setError('Could not load starter templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const apply = async (key: string, title: string) => {
    if (applying) return;
    setApplying(key);
    try {
      const { data } = await dailyAPI.applyStarter(key);
      toast.success(`“${title}” added ${data.count} ordinary tasks`, {
        description: 'They live in your projects like anything you typed — triage from the Inbox or Today.',
      });
      onApplied?.();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; data?: { message?: string } } })?.response?.status;
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (status === 402) toast.error(msg || 'Plan limit reached — free up tasks or upgrade.');
      else if (status === 404) toast.error('That starter no longer exists — refresh.');
      else toast.error(msg || 'Could not apply — try again.');
    } finally {
      setApplying(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500" role="status" aria-live="polite">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        Loading starters…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertCircle size={28} className="text-red-400" aria-hidden="true" />
        <p role="alert" className="text-sm text-gray-600 dark:text-gray-300">{error}</p>
        <Button size="sm" onClick={load} icon={<RefreshCw size={14} aria-hidden="true" />}>
          Retry
        </Button>
      </div>
    );
  }

  if (starters.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={<Sparkles size={20} aria-hidden="true" />}
        title="No starters right now"
        description="Start from a blank project instead."
      />
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        Starters create ordinary projects, tasks, labels and views — no special modes, no locked-in structure. Edit or delete anything after.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {starters.map((s) => (
          <Card key={s.key} padding="md" className="flex flex-col gap-2">
            <div className="flex items-start gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-yellow-100 text-yellow-700 dark:bg-yellow-500/12 dark:text-yellow-300" aria-hidden="true">
                <Sparkles size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[15px] font-semibold text-gray-900 dark:text-gray-100">{s.title}</h3>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{s.description}</p>
              </div>
            </div>
            <ul className="space-y-0.5" aria-label={`Preview of ${s.title}`}>
              {s.tasks.slice(0, 3).map((t, i) => (
                <li key={i} className="truncate text-xs text-gray-600 dark:text-gray-300">
                  · {t.title}
                </li>
              ))}
              {s.tasks.length > 3 && (
                <li className="text-[11px] text-gray-400">+{s.tasks.length - 3} more</li>
              )}
            </ul>
            <div className="mt-auto flex items-center justify-between gap-2 border-t border-gray-100 pt-2.5 dark:border-gray-800">
              <span className="text-[11px] text-gray-400">
                {s.taskCount} tasks · {s.category}
              </span>
              <Button
                size="sm"
                onClick={() => void apply(s.key, s.title)}
                loading={applying === s.key}
                disabled={applying !== null}
                icon={<Plus size={14} aria-hidden="true" />}
                aria-label={`Use ${s.title} starter (creates ${s.taskCount} ordinary tasks)`}
              >
                Use starter
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
