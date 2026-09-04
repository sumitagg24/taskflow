import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RotateCcw, Trash2, Search, AlertTriangle, Clock } from 'lucide-react';
import { getTrash, restoreTask, purgeTask, emptyTrash } from '@/api/tasks';
import {
  Button, Card, Input, EmptyState, SkeletonCard, LoadingRegion,
  StatusBadge, PriorityDot, DeleteConfirmModal, Tooltip, Badge,
} from '@/components/ui';
import { cn } from '@/lib/utils';

interface TrashedTask {
  _id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  category?: string;
  deletedAt: string;
  purgeAt: string;
}

/** Whole days until the server destroys the task for good. */
function daysLeft(purgeAt: string): number {
  return Math.max(0, Math.ceil((new Date(purgeAt).getTime() - Date.now()) / 86_400_000));
}

function relativeDay(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 30) return `${diff} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function TrashPage() {
  const [tasks, setTasks] = useState<TrashedTask[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashedTask | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await getTrash();
      setTasks(data.tasks ?? []);
      if (data.retentionDays) setRetentionDays(data.retentionDays);
    } catch {
      toast.error('Could not load Trash');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.category ?? '').toLowerCase().includes(q)
    );
  }, [tasks, query]);

  const handleRestore = async (task: TrashedTask) => {
    setBusyId(task._id);
    try {
      await restoreTask(task._id);
      setTasks((prev) => prev.filter((t) => t._id !== task._id));
      toast.success(`“${task.title}” restored`);
      // Other views hold their own copy of the task list, so tell them to refetch
      // rather than trying to thread the restored task back through props.
      window.dispatchEvent(new CustomEvent('tasks:refresh'));
    } catch {
      toast.error('Could not restore task');
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async () => {
    if (!purgeTarget) return;
    setWorking(true);
    try {
      await purgeTask(purgeTarget._id);
      setTasks((prev) => prev.filter((t) => t._id !== purgeTarget._id));
      toast.success('Task permanently deleted');
      setPurgeTarget(null);
    } catch {
      toast.error('Could not delete task');
    } finally {
      setWorking(false);
    }
  };

  const handleEmpty = async () => {
    setWorking(true);
    try {
      const { data } = await emptyTrash();
      setTasks([]);
      toast.success(`Trash emptied — ${data.deletedCount ?? 0} task(s) removed`);
      setConfirmEmpty(false);
    } catch {
      toast.error('Could not empty Trash');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="animate-fadeIn p-4 lg:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-gray-900 dark:text-gray-100">Trash</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Deleted tasks stay here for {retentionDays} days, then they&apos;re gone for good.
          </p>
        </div>
        {tasks.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            icon={<Trash2 size={15} />}
            onClick={() => setConfirmEmpty(true)}
          >
            Empty Trash
          </Button>
        )}
      </div>

      {tasks.length > 3 && (
        <div className="mb-4 max-w-sm">
          <Input
            icon={<Search size={16} />}
            placeholder="Search Trash…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search deleted tasks"
          />
        </div>
      )}

      {loading ? (
        <LoadingRegion label="Loading Trash">
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </LoadingRegion>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<Trash2 size={22} />}
          title="Trash is empty"
          description="Tasks you delete land here first, so a mis-click is never permanent."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Search size={22} />}
          title="No matches"
          description={`Nothing in Trash matches “${query}”.`}
          action={<Button variant="ghost" size="sm" onClick={() => setQuery('')}>Clear search</Button>}
        />
      ) : (
        <ul className="space-y-2.5">
          {visible.map((task) => {
            const left = daysLeft(task.purgeAt);
            const expiringSoon = left <= 3;
            return (
              <li key={task._id}>
                <Card variant="quiet" padding="sm" className="flex items-center gap-3">
                  <PriorityDot priority={task.priority ?? 'none'} />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800 line-through decoration-gray-300 dark:text-gray-200 dark:decoration-gray-600">
                      {task.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <StatusBadge status={task.status} />
                      {task.category && task.category !== 'uncategorized' && (
                        <Badge variant="muted">{task.category}</Badge>
                      )}
                      <span>Deleted {relativeDay(task.deletedAt)}</span>
                    </div>
                  </div>

                  <span
                    className={cn(
                      'hidden shrink-0 items-center gap-1 text-xs sm:flex',
                      expiringSoon ? 'text-red-600 dark:text-red-400' : 'text-gray-400'
                    )}
                  >
                    {expiringSoon ? <AlertTriangle size={13} /> : <Clock size={13} />}
                    {left === 0 ? 'Purging today' : `${left}d left`}
                  </span>

                  <div className="flex shrink-0 items-center gap-1">
                    <Tooltip content="Restore" side="top">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Restore ${task.title}`}
                        loading={busyId === task._id}
                        onClick={() => handleRestore(task)}
                      >
                        <RotateCcw size={16} />
                      </Button>
                    </Tooltip>
                    <Tooltip content="Delete forever" side="top">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Permanently delete ${task.title}`}
                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        onClick={() => setPurgeTarget(task)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </Tooltip>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <DeleteConfirmModal
        isOpen={!!purgeTarget}
        onClose={() => { if (!working) setPurgeTarget(null); }}
        onConfirm={handlePurge}
        itemName={purgeTarget?.title}
        title="Delete forever?"
        message="This permanently removes the task. It cannot be restored."
        confirmLabel="Delete forever"
        loading={working}
      />

      <DeleteConfirmModal
        isOpen={confirmEmpty}
        onClose={() => { if (!working) setConfirmEmpty(false); }}
        onConfirm={handleEmpty}
        title="Empty Trash?"
        message={`This permanently deletes all ${tasks.length} task(s) in Trash. It cannot be undone.`}
        confirmLabel="Empty Trash"
        loading={working}
      />
    </div>
  );
}
