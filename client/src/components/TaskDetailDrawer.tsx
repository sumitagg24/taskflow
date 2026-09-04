import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarDays,
  Check,
  Clock,
  Folder,
  History,
  Link2,
  ListChecks,
  MessageSquare,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Star,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  getTask,
  addSubtask,
  updateSubtask,
  deleteSubtask,
  addComment,
  deleteComment,
  startTimer,
  stopTimer,
  toggleFavorite,
  getActivityLog,
} from '@/api/tasks';
import {
  Modal,
  Button,
  Input,
  Badge,
  StatusBadge,
  PriorityBadge,
  Progress,
  Skeleton,
  LoadingRegion,
  Avatar,
} from './ui';
import { cn } from '@/lib/utils';

type AnyTask = Record<string, any>;

interface TaskDetailDrawerProps {
  /** `null` keeps the drawer closed; a change of id reloads it. */
  taskId: string | null;
  onClose: () => void;
  onEdit: (task: AnyTask) => void;
  onDelete: (task: AnyTask) => void;
  /** Fired with the fresh task after every mutation so lists stay in step. */
  onChanged?: (task: AnyTask) => void;
}

const serverMessage = (err: any, fallback: string) =>
  err?.response?.data?.message || fallback;

/** Minutes → "1h 30m". Matches the format TaskForm uses for estimates. */
const formatMinutes = (min: number) => {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
};

const formatDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';

const timeAgo = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(mins)) return '';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
};

/** A running session is one with a start and no end yet. */
const activeSession = (task: AnyTask | null) =>
  (task?.timeSessions || []).some((s: AnyTask) => s.start && !s.end);

/** Section shell: a labelled block with an icon, used for every panel below. */
function Section({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-hairline rounded-xl border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
          <span aria-hidden="true" className="text-gray-400 dark:text-gray-500">
            {icon}
          </span>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

const emptyLine = (text: string) => (
  <p className="text-sm text-gray-500 dark:text-gray-400">{text}</p>
);

export default function TaskDetailDrawer({
  taskId,
  onClose,
  onEdit,
  onDelete,
  onChanged,
}: TaskDetailDrawerProps) {
  const [task, setTask] = useState<AnyTask | null>(null);
  const [activity, setActivity] = useState<AnyTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [commentText, setCommentText] = useState('');

  // Mutation endpoints answer with the task *unpopulated*, which would blank
  // out dependency titles and comment authors. Re-reading costs one round trip
  // and keeps every section honest.
  const reload = useCallback(
    async (announce = true) => {
      if (!taskId) return null;
      const { data } = await getTask(taskId);
      setTask(data);
      if (announce) onChanged?.(data);
      return data;
    },
    [taskId, onChanged]
  );

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      setActivity([]);
      setSubtaskTitle('');
      setCommentText('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setTask(null);

    // The history panel is supplementary: a failed read leaves it empty rather
    // than taking the whole drawer down with it.
    Promise.all([
      getTask(taskId),
      getActivityLog({ taskId, limit: 25 }).catch(() => ({ data: [] })),
    ])
      .then(([detail, log]) => {
        if (cancelled) return;
        setTask(detail.data);
        setActivity(Array.isArray(log.data) ? log.data : []);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error('Task no longer available');
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `onClose` is stable in App; re-running on it would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const mutate = useCallback(
    async (key: string, fn: () => Promise<unknown>, fallback: string) => {
      setBusy(key);
      try {
        await fn();
        await reload();
      } catch (err) {
        toast.error(serverMessage(err, fallback));
      } finally {
        setBusy(null);
      }
    },
    [reload]
  );

  const id = task?._id as string | undefined;

  const submitSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    const title = subtaskTitle.trim();
    if (!title || !id) return;
    setSubtaskTitle('');
    mutate('subtask', () => addSubtask(id, title), 'Could not add that step');
  };

  const submitComment = (e: React.FormEvent) => {
    e.preventDefault();
    const text = commentText.trim();
    if (!text || !id) return;
    setCommentText('');
    mutate('comment', () => addComment(id, text), 'Could not post that comment');
  };

  const toggleTimer = () => {
    if (!id) return;
    const running = activeSession(task);
    mutate(
      'timer',
      () => (running ? stopTimer(id) : startTimer(id)),
      running ? 'Could not stop the timer' : 'Could not start the timer'
    );
  };

  const subtasks: AnyTask[] = task?.subtasks || [];
  const doneSubtasks = subtasks.filter((s) => s.completed).length;
  const dependencies: AnyTask[] = (task?.dependencies || []).filter((d: AnyTask) => d.taskId);
  const blockedBy = dependencies.filter((d) => d.type === 'blocked-by');
  const blocks = dependencies.filter((d) => d.type === 'blocks');
  const comments: AnyTask[] = task?.comments || [];
  const tags: string[] = task?.tags || [];
  const running = activeSession(task);
  const estimate = Number(task?.estimatedTime) || 0;
  const spent = Number(task?.timeSpent) || 0;

  const footer = task ? (
    <div className="flex items-center gap-2">
      <Button icon={<Pencil size={14} />} onClick={() => onEdit(task)}>
        Edit
      </Button>
      <Button
        variant="secondary"
        loading={busy === 'favorite'}
        icon={
          <Star
            size={14}
            className={task.isFavorite ? 'fill-yellow-400 text-yellow-500' : undefined}
          />
        }
        onClick={() =>
          id && mutate('favorite', () => toggleFavorite(id), 'Could not update favorites')
        }
      >
        {task.isFavorite ? 'Favorited' : 'Favorite'}
      </Button>
      <Button
        variant="ghost"
        className="ml-auto text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
        icon={<Trash2 size={14} />}
        onClick={() => onDelete(task)}
      >
        Delete
      </Button>
    </div>
  ) : null;

  return (
    <Modal
      isOpen={taskId !== null}
      onClose={onClose}
      placement="right"
      size="xl"
      title={task?.title || 'Task'}
      subtitle={task ? `Created ${formatDate(task.createdAt)}` : undefined}
      footer={footer}
    >
      {loading || !task ? (
        <LoadingRegion label="Loading task details">
          <Skeleton className="h-20" rounded="lg" />
          <Skeleton className="mt-3 h-28" rounded="lg" />
          <Skeleton className="mt-3 h-40" rounded="lg" />
        </LoadingRegion>
      ) : (
        <div className="space-y-3">
          {/* Meta first: status and priority are the two things a reader wants
              before any of the detail below. */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority || 'none'} />
            {task.isRecurring && (
              <Badge variant="info" className="gap-1.5">
                <Repeat size={11} aria-hidden="true" />
                {task.recurringInterval || 'weekly'}
              </Badge>
            )}
          </div>

          <dl className="border-hairline grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-surface p-4 text-sm">
            <div>
              <dt className="caption-upper flex items-center gap-1.5">
                <CalendarDays size={12} aria-hidden="true" className="text-gray-400" />
                Due
              </dt>
              <dd className="mt-1 text-gray-800 dark:text-gray-200">
                {formatDate(task.dueDate)}
              </dd>
            </div>
            <div>
              <dt className="caption-upper flex items-center gap-1.5">
                <Folder size={12} aria-hidden="true" className="text-gray-400" />
                Category
              </dt>
              <dd className="mt-1 truncate text-gray-800 dark:text-gray-200">
                {task.category || 'Uncategorised'}
              </dd>
            </div>
            {task.recurringNextDate && (
              <div>
                <dt className="caption-upper flex items-center gap-1.5">
                  <Repeat size={12} aria-hidden="true" className="text-gray-400" />
                  Next occurrence
                </dt>
                <dd className="mt-1 text-gray-800 dark:text-gray-200">
                  {formatDate(task.recurringNextDate)}
                </dd>
              </div>
            )}
            {task.assignee && (
              <div>
                <dt className="caption-upper">Assignee</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <Avatar size="xs" name={task.assignee.name} src={task.assignee.avatar} />
                  <span className="truncate text-gray-800 dark:text-gray-200">
                    {task.assignee.name}
                  </span>
                </dd>
              </div>
            )}
          </dl>

          {task.description && (
            <section className="border-hairline rounded-xl border bg-surface p-4">
              <p className="text-sm whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                {task.description}
              </p>
            </section>
          )}
          {/* Subtasks */}
          <Section
            icon={<ListChecks size={14} />}
            title="Steps"
            action={
              subtasks.length > 0 ? (
                <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  {doneSubtasks} of {subtasks.length} done
                </span>
              ) : undefined
            }
          >
            {subtasks.length > 0 && (
              <Progress
                className="mb-3"
                size="xs"
                value={doneSubtasks}
                max={subtasks.length}
                tone="success"
                ariaLabel={`Steps: ${doneSubtasks} of ${subtasks.length} complete`}
              />
            )}

            <ul className="space-y-1">
              {subtasks.map((sub) => (
                <li key={sub._id} className="group flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      id &&
                      mutate(
                        `subtask-${sub._id}`,
                        () => updateSubtask(id, sub._id, { completed: !sub.completed }),
                        'Could not update that step'
                      )
                    }
                    aria-pressed={!!sub.completed}
                    aria-label={`Mark “${sub.title}” ${sub.completed ? 'not done' : 'done'}`}
                    className={cn(
                      'flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors',
                      sub.completed
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-gray-300 hover:border-gray-400 dark:border-gray-600'
                    )}
                  >
                    {sub.completed && <Check size={11} strokeWidth={3} aria-hidden="true" />}
                  </button>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm',
                      sub.completed
                        ? 'text-gray-400 line-through dark:text-gray-500'
                        : 'text-gray-700 dark:text-gray-300'
                    )}
                  >
                    {sub.title}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      id &&
                      mutate(
                        `subtask-${sub._id}`,
                        () => deleteSubtask(id, sub._id),
                        'Could not remove that step'
                      )
                    }
                    aria-label={`Remove step “${sub.title}”`}
                    className="shrink-0 rounded p-1 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600 focus-visible:opacity-100 dark:hover:text-red-400"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>

            <form onSubmit={submitSubtask} className="mt-2 flex gap-2">
              <Input
                wrapperClassName="flex-1"
                aria-label="New step"
                placeholder="Add a step…"
                value={subtaskTitle}
                onChange={(e) => setSubtaskTitle(e.target.value)}
              />
              <Button
                type="submit"
                variant="secondary"
                loading={busy === 'subtask'}
                disabled={!subtaskTitle.trim()}
                icon={<Plus size={14} />}
                aria-label="Add step"
              />
            </form>
          </Section>
          {/* Time — estimate vs actual, plus the live timer. */}
          <Section
            icon={<Clock size={14} />}
            title="Time"
            action={
              <Button
                size="sm"
                variant={running ? 'secondary' : 'accentSoft'}
                loading={busy === 'timer'}
                icon={running ? <Pause size={13} /> : <Play size={13} />}
                onClick={toggleTimer}
              >
                {running ? 'Stop timer' : 'Start timer'}
              </Button>
            }
          >
            <div className="flex items-baseline gap-4">
              <div>
                <p className="caption-upper">Spent</p>
                <p className="font-display mt-0.5 text-xl leading-none text-gray-900 dark:text-gray-50">
                  {formatMinutes(spent)}
                </p>
              </div>
              <div>
                <p className="caption-upper">Estimate</p>
                <p className="font-display mt-0.5 text-xl leading-none text-gray-500 dark:text-gray-400">
                  {estimate ? formatMinutes(estimate) : '—'}
                </p>
              </div>
              {running && (
                <Badge variant="warning" className="ml-auto gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-current"
                  />
                  Running
                </Badge>
              )}
            </div>

            {/* Only meter against a real estimate — a bar against zero would
                read as "0% done" when the truth is "nobody estimated this". */}
            {estimate > 0 && (
              <Progress
                className="mt-3"
                size="sm"
                value={Math.min(spent, estimate)}
                max={estimate}
                tone={spent > estimate ? 'danger' : 'accent'}
                ariaLabel={`Time used: ${formatMinutes(spent)} of ${formatMinutes(estimate)}`}
              />
            )}
            {estimate > 0 && spent > estimate && (
              <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                {formatMinutes(spent - estimate)} over estimate
              </p>
            )}
          </Section>

          {/* Dependencies — rendered from the populated `{_id, title, status}`. */}
          {dependencies.length > 0 && (
            <Section icon={<Link2 size={14} />} title="Dependencies">
              <div className="space-y-3">
                {[
                  { label: 'Blocked by', items: blockedBy },
                  { label: 'Blocks', items: blocks },
                ]
                  .filter((g) => g.items.length > 0)
                  .map((group) => (
                    <div key={group.label}>
                      <p className="caption-upper mb-1.5">{group.label}</p>
                      <ul className="flex flex-wrap gap-1.5">
                        {group.items.map((dep) => (
                          <li key={dep._id || dep.taskId._id}>
                            <span className="border-hairline inline-flex max-w-[15rem] items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-xs">
                              <span className="truncate text-gray-700 dark:text-gray-300">
                                {dep.taskId.title}
                              </span>
                              <StatusBadge status={dep.taskId.status} className="shrink-0 px-1.5" />
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            </Section>
          )}

          {tags.length > 0 && (
            <Section icon={<Tag size={14} />} title="Tags">
              <ul className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <li key={tag}>
                    <Badge variant="outline">{tag}</Badge>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {/* Comments. `userId` arrives populated from getTask; the fallback
              covers a document that somehow reaches us unpopulated. */}
          <Section
            icon={<MessageSquare size={14} />}
            title="Comments"
            action={
              comments.length > 0 ? (
                <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  {comments.length}
                </span>
              ) : undefined
            }
          >
            {comments.length === 0
              ? emptyLine('No comments yet.')
              : (
                <ul className="space-y-3">
                  {comments.map((c) => {
                    const author = c.userId && typeof c.userId === 'object' ? c.userId : null;
                    return (
                      <li key={c._id} className="group flex gap-2.5">
                        <Avatar size="xs" name={author?.name || 'You'} src={author?.avatar} />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-baseline gap-2 text-xs">
                            <span className="font-medium text-gray-800 dark:text-gray-200">
                              {author?.name || 'You'}
                            </span>
                            <span className="text-gray-400 dark:text-gray-500">
                              {timeAgo(c.createdAt)}
                            </span>
                          </p>
                          <p className="mt-0.5 text-sm whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                            {c.text}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            id &&
                            mutate(
                              `comment-${c._id}`,
                              () => deleteComment(id, c._id),
                              'Could not delete that comment'
                            )
                          }
                          aria-label="Delete comment"
                          className="shrink-0 self-start rounded p-1 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600 focus-visible:opacity-100 dark:hover:text-red-400"
                        >
                          <X size={13} aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

            <form onSubmit={submitComment} className="mt-3 flex gap-2">
              <Input
                wrapperClassName="flex-1"
                aria-label="New comment"
                placeholder="Leave a note…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                maxLength={2000}
              />
              <Button
                type="submit"
                variant="secondary"
                loading={busy === 'comment'}
                disabled={!commentText.trim()}
                icon={<Plus size={14} />}
                aria-label="Post comment"
              />
            </form>
          </Section>

          {/* History is read-only and comes from the ActivityLog collection,
              scoped to this task by the taskId query. */}
          {activity.length > 0 && (
            <Section icon={<History size={14} />} title="History">
              <ol className="space-y-2">
                {activity.map((entry) => (
                  <li key={entry._id} className="flex items-baseline gap-2 text-sm">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600"
                    />
                    <span className="min-w-0 flex-1 text-gray-700 dark:text-gray-300">
                      {entry.details || entry.action.replace(/_/g, ' ')}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                      {timeAgo(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            </Section>
          )}



        </div>
      )}
    </Modal>
  );
}
