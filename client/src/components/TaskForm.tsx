import { useState, useEffect, useMemo, useRef, useCallback, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, X, Calendar, Tag as TagIcon, Repeat, Clock, Sparkles,
  Link2, Search, GripVertical,
} from 'lucide-react';
import { createTask, updateTask, getTasks, aiAPI } from '@/api/tasks';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { fuzzyFilter } from '@/lib/fuzzy';
import { notifyPlanLimit } from '@/lib/planLimit';
import { Button } from './ui/Button';
import { Textarea, Select } from './ui/Input';
import { Switch } from './ui/Switch';
import { StatusBadge, STATUS_LABELS, PRIORITY_LABELS } from './ui/Badge';
import { Progress } from './ui/Progress';

interface Dependency {
  taskId: string;
  type: 'blocks' | 'blocked-by';
  /** Denormalised for rendering; never sent back verbatim. */
  title?: string;
  status?: string;
}

interface TaskData {
  _id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  dueDate?: string;
  tags?: string[];
  category?: string;
  estimatedTime?: number;
  timeSpent?: number;
  isRecurring?: boolean;
  recurringInterval?: string;
  recurringEndDate?: string;
  subtasks?: any[];
  dependencies?: any[];
  [key: string]: any;
}

interface TaskFormProps {
  existingTask?: TaskData | null;
  onSuccess: (task: any) => void;
  onCancel: () => void;
}

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;

const statusOptions = ['backlog', 'pending', 'in-progress', 'completed', 'blocked', 'review']
  .map((value) => ({ value, label: STATUS_LABELS[value] ?? value }));

const priorityOptions = ['critical', 'high', 'medium', 'low', 'none']
  .map((value) => ({ value, label: PRIORITY_LABELS[value] ?? value }));

const categoryOptions = [
  'work', 'personal', 'college', 'projects', 'fitness', 'shopping', 'finance', 'learning',
].map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));

const recurringOptions = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
];

const tagOptions = [
  'bug', 'feature', 'urgent', 'design', 'frontend', 'backend', 'devops', 'documentation', 'meeting', 'idea',
];

/** 90 → "1h 30m". Estimates are stored in minutes but nobody thinks in 480s. */
function formatMinutes(min: number): string {
  if (!min) return '0m';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** Section wrapper for the side rail so every group gets the same rhythm. */
function RailSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="caption-upper flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
        {icon && <span aria-hidden="true">{icon}</span>}
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function TaskForm({ existingTask, onSuccess, onCancel }: TaskFormProps) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'pending',
    priority: 'medium',
    dueDate: '',
    category: 'work',
    tags: [] as string[],
    estimatedTime: '' as string,
    isRecurring: false,
    recurringInterval: 'weekly',
    recurringEndDate: '',
  });
  const [newSubtask, setNewSubtask] = useState('');
  const [subtasks, setSubtasks] = useState<{ _id?: string; title: string; completed: boolean }[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [titleError, setTitleError] = useState('');

  // Dependency picker state. Candidates load on first open, not on mount, so the
  // common "type a title and hit Create" path costs no extra request.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [candidates, setCandidates] = useState<TaskData[] | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const tagBoxRef = useRef<HTMLDivElement>(null);
  const linkBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!existingTask) return;
    setForm({
      title: existingTask.title || '',
      description: existingTask.description || '',
      status: existingTask.status || 'pending',
      priority: existingTask.priority || 'medium',
      dueDate: existingTask.dueDate ? existingTask.dueDate.slice(0, 10) : '',
      category: existingTask.category || 'work',
      tags: existingTask.tags || [],
      estimatedTime: existingTask.estimatedTime ? String(existingTask.estimatedTime) : '',
      isRecurring: existingTask.isRecurring || false,
      recurringInterval: existingTask.recurringInterval || 'weekly',
      recurringEndDate: existingTask.recurringEndDate ? existingTask.recurringEndDate.slice(0, 10) : '',
    });
    setSubtasks(existingTask.subtasks || []);
    // `dependencies.taskId` comes back populated ({_id, title, status}) from the
    // detail endpoint but bare from list endpoints — normalise both shapes.
    setDependencies(
      (existingTask.dependencies || [])
        .map((d: any) => {
          const ref = d?.taskId;
          if (!ref) return null;
          return typeof ref === 'object'
            ? { taskId: String(ref._id), type: d.type ?? 'blocked-by', title: ref.title, status: ref.status }
            : { taskId: String(ref), type: d.type ?? 'blocked-by' };
        })
        .filter(Boolean) as Dependency[]
    );
  }, [existingTask]);

  // Both popovers are click-to-open, so they need click-outside to close —
  // otherwise the suggestion list hangs around over the rest of the form.
  useEffect(() => {
    if (!showTagSuggestions && !linkOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (showTagSuggestions && tagBoxRef.current && !tagBoxRef.current.contains(target)) {
        setShowTagSuggestions(false);
      }
      if (linkOpen && linkBoxRef.current && !linkBoxRef.current.contains(target)) {
        setLinkOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showTagSuggestions, linkOpen]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // ─── Subtasks ─────────────────────────────────────────────

  const addSubtask = () => {
    const title = newSubtask.trim();
    if (!title) return;
    setSubtasks((prev) => [...prev, { title, completed: false }]);
    setNewSubtask('');
  };

  const removeSubtask = (index: number) =>
    setSubtasks((prev) => prev.filter((_, i) => i !== index));

  const doneSubtasks = subtasks.filter((s) => s.completed).length;

  // ─── Tags ─────────────────────────────────────────────────

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase();
    if (!tag || form.tags.includes(tag)) {
      setTagInput('');
      return;
    }
    setForm((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
    setTagInput('');
    setShowTagSuggestions(false);
  };

  const removeTag = (tag: string) =>
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));

  const tagSuggestions = useMemo(
    () => tagOptions.filter((t) => t.includes(tagInput.trim().toLowerCase()) && !form.tags.includes(t)),
    [tagInput, form.tags]
  );

  // ─── Dependencies ─────────────────────────────────────────

  const openLinkPicker = useCallback(async () => {
    setLinkOpen(true);
    if (candidates || loadingCandidates) return;
    setLoadingCandidates(true);
    try {
      const { data } = await getTasks({ sort: 'updated' });
      setCandidates(Array.isArray(data) ? data : []);
    } catch {
      setCandidates([]);
      toast.error('Could not load tasks to link');
    } finally {
      setLoadingCandidates(false);
    }
  }, [candidates, loadingCandidates]);

  const linkResults = useMemo(() => {
    if (!candidates) return [];
    const taken = new Set(dependencies.map((d) => d.taskId));
    const pool = candidates.filter((t) => t._id !== existingTask?._id && !taken.has(t._id));
    return fuzzyFilter(pool, linkQuery, (t) => t.title, 8).map((r) => r.item);
  }, [candidates, dependencies, linkQuery, existingTask]);

  const addDependency = (task: TaskData, type: Dependency['type']) => {
    setDependencies((prev) => [...prev, { taskId: task._id, type, title: task.title, status: task.status }]);
    setLinkQuery('');
    setLinkOpen(false);
  };

  const removeDependency = (taskId: string) =>
    setDependencies((prev) => prev.filter((d) => d.taskId !== taskId));

  const toggleDependencyType = (taskId: string) =>
    setDependencies((prev) =>
      prev.map((d) =>
        d.taskId === taskId ? { ...d, type: d.type === 'blocked-by' ? 'blocks' : 'blocked-by' } : d
      )
    );

  // ─── AI helpers ───────────────────────────────────────────

  const handleAIParse = async () => {
    if (!form.title.trim()) return;
    setAiLoading(true);
    try {
      const { data } = await aiAPI.parseTask(form.title);
      setForm((prev) => ({
        ...prev,
        title: data.title || prev.title,
        description: prev.description || data.description || '',
        priority: data.priority || prev.priority,
        dueDate: data.dueDate ? String(data.dueDate).slice(0, 10) : prev.dueDate,
        category: data.category || prev.category,
        estimatedTime: data.estimatedTime ? String(data.estimatedTime) : prev.estimatedTime,
        tags: data.tags ? [...new Set([...prev.tags, ...data.tags])] : prev.tags,
      }));
      toast.success('Filled in from your title');
    } catch {
      toast.error('AI parsing unavailable');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAIBreakdown = async () => {
    if (!existingTask) return;
    setAiLoading(true);
    try {
      const { data } = await aiAPI.breakdownTask(existingTask._id);
      if (data.subtasks?.length) {
        setSubtasks((prev) => [
          ...prev,
          ...data.subtasks.map((s: any) => ({ title: s.title, completed: false })),
        ]);
        toast.success(`Added ${data.subtasks.length} subtasks`);
      } else {
        toast.message('No subtasks suggested');
      }
    } catch {
      toast.error('AI breakdown unavailable');
    } finally {
      setAiLoading(false);
    }
  };

  // ─── Submit ───────────────────────────────────────────────

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setTitleError('Give the task a title first.');
      return;
    }
    setTitleError('');
    setSubmitting(true);

    const estimate = Number(form.estimatedTime);
    const payload = {
      ...form,
      title,
      dueDate: form.dueDate || null,
      recurringEndDate: form.isRecurring && form.recurringEndDate ? form.recurringEndDate : null,
      estimatedTime: Number.isFinite(estimate) && estimate > 0 ? Math.round(estimate) : 0,
      subtasks,
      dependencies: dependencies.map((d) => ({ taskId: d.taskId, type: d.type })),
    };

    try {
      const { data } = existingTask
        ? await updateTask(existingTask._id, payload)
        : await createTask(payload);
      toast.success(existingTask ? 'Task updated' : 'Task created');
      onSuccess(data);
    } catch (err: any) {
      // A plan-limit rejection gets its own upgrade prompt; the modal stays open
      // so the draft isn't lost while the user frees up quota.
      if (!notifyPlanLimit(err)) {
        toast.error(err.response?.data?.message || 'Something went wrong');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const spent = existingTask?.timeSpent ?? 0;
  const estimateNum = Number(form.estimatedTime) || 0;
  const overrun = estimateNum > 0 && spent > estimateNum;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* ── Main column ─────────────────────────────────── */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="task-title" className="block text-[13px] font-medium text-gray-700 dark:text-gray-300">
                Title
                <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAIParse}
                loading={aiLoading}
                disabled={!form.title.trim()}
                icon={<Sparkles size={12} />}
              >
                Auto-fill
              </Button>
            </div>
            <input
              id="task-title"
              value={form.title}
              onChange={(e) => {
                set('title', e.target.value.slice(0, TITLE_MAX));
                if (titleError) setTitleError('');
              }}
              placeholder="What needs doing?"
              maxLength={TITLE_MAX}
              autoFocus
              aria-invalid={titleError ? true : undefined}
              aria-describedby="task-title-help"
              className={cn(
                'bg-card w-full rounded-lg border px-3.5 py-2.5 text-base font-medium text-gray-900 outline-none transition-[border-color,box-shadow]',
                'placeholder:font-normal placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500',
                titleError
                  ? 'border-red-500 focus:ring-[3px] focus:ring-red-500/15'
                  : 'border-gray-200 focus:border-yellow-400 focus:ring-[3px] focus:ring-yellow-400/15 dark:border-gray-700'
              )}
            />
            <p
              id="task-title-help"
              className={cn(
                'flex items-center justify-between text-xs',
                titleError ? 'animate-shake text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
              )}
            >
              <span>{titleError || 'Keep it short — details go below.'}</span>
              {form.title.length > TITLE_MAX - 40 && (
                <span className="tabular-nums">{form.title.length}/{TITLE_MAX}</span>
              )}
            </p>
          </div>

          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => set('description', e.target.value.slice(0, DESCRIPTION_MAX))}
            placeholder="Context, links, acceptance criteria…"
            rows={4}
            maxLength={DESCRIPTION_MAX}
            helperText={
              form.description.length > DESCRIPTION_MAX - 500
                ? `${form.description.length}/${DESCRIPTION_MAX} characters`
                : undefined
            }
          />

          {/* Subtasks */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-medium text-gray-700 dark:text-gray-300">
                Subtasks
                {subtasks.length > 0 && (
                  <span className="ml-1.5 text-xs font-normal text-gray-500 tabular-nums dark:text-gray-400">
                    {doneSubtasks}/{subtasks.length}
                  </span>
                )}
              </h3>
              {existingTask && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAIBreakdown}
                  loading={aiLoading}
                  icon={<Sparkles size={12} />}
                >
                  Suggest steps
                </Button>
              )}
            </div>

            {subtasks.length > 0 && (
              <Progress
                value={doneSubtasks}
                max={subtasks.length}
                size="sm"
                tone={doneSubtasks === subtasks.length ? 'success' : 'accent'}
                label="Subtask progress"
              />
            )}

            <ul className="space-y-1">
              <AnimatePresence initial={false}>
                {subtasks.map((sub, i) => (
                  <motion.li
                    key={sub._id ?? `${sub.title}-${i}`}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="group hover:bg-surface flex items-center gap-2 rounded-lg px-1.5 py-1"
                  >
                    <GripVertical size={12} className="shrink-0 text-gray-300 dark:text-gray-600" aria-hidden="true" />
                    <input
                      type="checkbox"
                      id={`subtask-${i}`}
                      checked={sub.completed}
                      onChange={() =>
                        setSubtasks((prev) => prev.map((s, j) => (j === i ? { ...s, completed: !s.completed } : s)))
                      }
                      className="h-3.5 w-3.5 shrink-0 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500 dark:border-gray-600"
                    />
                    <label
                      htmlFor={`subtask-${i}`}
                      className={cn(
                        'flex-1 cursor-pointer text-sm text-gray-800 dark:text-gray-200',
                        sub.completed && 'text-gray-400 line-through dark:text-gray-500'
                      )}
                    >
                      {sub.title}
                    </label>
                    <button
                      type="button"
                      onClick={() => removeSubtask(i)}
                      className="rounded p-1 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-500"
                      aria-label={`Remove subtask “${sub.title}”`}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>

            <div className="flex gap-2">
              <label className="sr-only" htmlFor="new-subtask">Add a subtask</label>
              <input
                id="new-subtask"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSubtask();
                  }
                }}
                placeholder="Break it into steps…"
                className="bg-card h-9 flex-1 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none transition-[border-color,box-shadow] placeholder:text-gray-400 focus:border-yellow-400 focus:ring-[3px] focus:ring-yellow-400/15 dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addSubtask}
                disabled={!newSubtask.trim()}
                icon={<Plus size={14} />}
                aria-label="Add subtask"
              />
            </div>
          </section>

          {/* Dependencies */}
          <section className="space-y-2" ref={linkBoxRef}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-gray-700 dark:text-gray-300">
                <Link2 size={13} aria-hidden="true" />
                Dependencies
              </h3>
              <Button type="button" variant="ghost" size="sm" onClick={openLinkPicker} icon={<Plus size={12} />}>
                Link a task
              </Button>
            </div>

            {dependencies.length === 0 && !linkOpen && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Nothing linked. Use this to record what has to land first.
              </p>
            )}

            {dependencies.length > 0 && (
              <ul className="space-y-1">
                {dependencies.map((dep) => (
                  <li
                    key={dep.taskId}
                    className="border-hairline bg-surface flex items-center gap-2 rounded-lg border px-2 py-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => toggleDependencyType(dep.taskId)}
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
                        dep.type === 'blocked-by'
                          ? 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-500/12 dark:text-red-300'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/12 dark:text-blue-300'
                      )}
                      title="Switch direction"
                    >
                      {dep.type === 'blocked-by' ? 'Blocked by' : 'Blocks'}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">
                      {dep.title ?? 'Linked task'}
                    </span>
                    {dep.status && <StatusBadge status={dep.status} />}
                    <button
                      type="button"
                      onClick={() => removeDependency(dep.taskId)}
                      className="rounded p-1 text-gray-400 hover:text-red-500"
                      aria-label={`Unlink “${dep.title ?? 'task'}”`}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {linkOpen && (
              <div className="border-hairline bg-card space-y-1 rounded-xl border p-2">
                <div className="relative">
                  <Search
                    size={13}
                    className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-gray-400"
                    aria-hidden="true"
                  />
                  <label className="sr-only" htmlFor="link-search">Search tasks to link</label>
                  <input
                    id="link-search"
                    autoFocus
                    value={linkQuery}
                    onChange={(e) => setLinkQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setLinkOpen(false);
                      }
                    }}
                    placeholder="Search your tasks…"
                    className="bg-surface h-8 w-full rounded-lg border-0 pr-2 pl-8 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
                  />
                </div>
                {loadingCandidates ? (
                  <p className="px-2 py-3 text-center text-xs text-gray-500 dark:text-gray-400">Loading tasks…</p>
                ) : linkResults.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-gray-500 dark:text-gray-400">
                    {linkQuery ? 'No matching task' : 'No other tasks to link yet'}
                  </p>
                ) : (
                  <ul className="max-h-44 overflow-y-auto">
                    {linkResults.map((task) => (
                      <li key={task._id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => addDependency(task, 'blocked-by')}
                          className="hover:bg-surface min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm text-gray-800 dark:text-gray-200"
                        >
                          {task.title}
                        </button>
                        <span className="shrink-0 pr-1 text-[10px] text-gray-400">blocked by</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>

        {/* ── Side rail ───────────────────────────────────── */}
        <aside className="border-hairline space-y-5 lg:border-l lg:pl-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
              options={statusOptions}
            />
            <Select
              label="Priority"
              value={form.priority}
              onChange={(e) => set('priority', e.target.value)}
              options={priorityOptions}
            />
            <Select
              label="Category"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              options={categoryOptions}
            />
            <div className="space-y-1.5">
              <label htmlFor="task-due" className="block text-[13px] font-medium text-gray-700 dark:text-gray-300">
                <Calendar size={12} className="mr-1 inline" aria-hidden="true" />
                Due date
              </label>
              <input
                id="task-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
                className="bg-card h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none transition-[border-color,box-shadow] focus:border-yellow-400 focus:ring-[3px] focus:ring-yellow-400/15 dark:border-gray-700 dark:text-gray-100"
              />
            </div>
          </div>

          {/* Estimate vs actual */}
          <RailSection title="Time" icon={<Clock size={11} />}>
            <div className="space-y-1.5">
              <label htmlFor="task-estimate" className="block text-[13px] font-medium text-gray-700 dark:text-gray-300">
                Estimate (minutes)
              </label>
              <input
                id="task-estimate"
                type="number"
                min={0}
                step={5}
                inputMode="numeric"
                value={form.estimatedTime}
                onChange={(e) => set('estimatedTime', e.target.value)}
                placeholder="e.g. 45"
                className="bg-card h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none transition-[border-color,box-shadow] placeholder:text-gray-400 focus:border-yellow-400 focus:ring-[3px] focus:ring-yellow-400/15 dark:border-gray-700 dark:text-gray-100"
              />
            </div>
            {existingTask && (spent > 0 || estimateNum > 0) && (
              <div className="space-y-1.5">
                <Progress
                  value={Math.min(spent, estimateNum || spent)}
                  max={estimateNum || spent || 1}
                  size="sm"
                  tone={overrun ? 'danger' : 'accent'}
                  label="Time logged against estimate"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatMinutes(spent)} logged
                  {estimateNum > 0 && ` of ${formatMinutes(estimateNum)}`}
                  {overrun && (
                    <span className="text-red-600 dark:text-red-400">
                      {' '}· {formatMinutes(spent - estimateNum)} over
                    </span>
                  )}
                </p>
              </div>
            )}
          </RailSection>

          {/* Recurrence */}
          <RailSection title="Repeat" icon={<Repeat size={11} />}>
            <Switch
              checked={form.isRecurring}
              onChange={(checked) => set('isRecurring', checked)}
              label="Recurring task"
              description="A fresh copy is scheduled after each completion."
            />
            {form.isRecurring && (
              <div className="space-y-3 pt-1">
                <Select
                  label="Frequency"
                  value={form.recurringInterval}
                  onChange={(e) => set('recurringInterval', e.target.value)}
                  options={recurringOptions}
                />
                <div className="space-y-1.5">
                  <label htmlFor="task-recur-end" className="block text-[13px] font-medium text-gray-700 dark:text-gray-300">
                    Stop repeating after
                  </label>
                  <input
                    id="task-recur-end"
                    type="date"
                    value={form.recurringEndDate}
                    min={form.dueDate || undefined}
                    onChange={(e) => set('recurringEndDate', e.target.value)}
                    className="bg-card h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none transition-[border-color,box-shadow] focus:border-yellow-400 focus:ring-[3px] focus:ring-yellow-400/15 dark:border-gray-700 dark:text-gray-100"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">Optional — leave blank to repeat forever.</p>
                </div>
              </div>
            )}
          </RailSection>

          {/* Tags */}
          <RailSection title="Tags" icon={<TagIcon size={11} />}>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-surface-strong inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="text-gray-400 transition-colors hover:text-red-500"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X size={10} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative" ref={tagBoxRef}>
              <label className="sr-only" htmlFor="task-tags">Add a tag</label>
              <input
                id="task-tags"
                value={tagInput}
                onChange={(e) => { setTagInput(e.target.value); setShowTagSuggestions(true); }}
                onFocus={() => setShowTagSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(tagInput);
                  } else if (e.key === 'Escape') {
                    setShowTagSuggestions(false);
                  } else if (e.key === 'Backspace' && !tagInput && form.tags.length) {
                    removeTag(form.tags[form.tags.length - 1]);
                  }
                }}
                placeholder="Add tag, then Enter"
                autoComplete="off"
                className="bg-card h-9 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none transition-[border-color,box-shadow] placeholder:text-gray-400 focus:border-yellow-400 focus:ring-[3px] focus:ring-yellow-400/15 dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
              {showTagSuggestions && tagSuggestions.length > 0 && (
                <div className="border-hairline bg-card absolute z-20 mt-1 w-full rounded-xl border p-1 shadow-lg">
                  {tagSuggestions.slice(0, 6).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addTag(tag)}
                      className="hover:bg-surface w-full rounded-lg px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </RailSection>
        </aside>
      </div>

      {/* ── Actions ───────────────────────────────────────── */}
      <div className="border-hairline flex items-center justify-end gap-3 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {existingTask ? 'Save changes' : 'Create task'}
        </Button>
      </div>
    </form>
  );
}
