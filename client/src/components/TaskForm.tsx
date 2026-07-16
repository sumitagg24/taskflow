import { useState, useEffect, FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Plus, X, Loader2, Calendar, Tag, Repeat, Clock, Sparkles } from 'lucide-react';
import { createTask, updateTask, aiAPI } from '@/api/tasks';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from './ui/Button';

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
  isRecurring?: boolean;
  recurringInterval?: string;
  subtasks?: any[];
  [key: string]: any;
}

interface TaskFormProps {
  existingTask?: TaskData | null;
  onSuccess: (task: any) => void;
  onCancel: () => void;
}

const statusOptions = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'pending', label: 'To Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'review', label: 'Review' },
];

const priorityOptions = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'None' },
];

const categoryOptions = [
  'work', 'personal', 'college', 'projects', 'fitness', 'shopping', 'finance', 'learning',
];

const tagOptions = [
  'bug', 'feature', 'urgent', 'design', 'frontend', 'backend', 'devops', 'documentation', 'meeting', 'idea',
];

export default function TaskForm({ existingTask, onSuccess, onCancel }: TaskFormProps) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'pending',
    priority: 'medium',
    dueDate: '',
    category: 'work',
    tags: [] as string[],
    estimatedTime: 0,
    isRecurring: false,
    recurringInterval: 'weekly' as string,
  });
  const [newSubtask, setNewSubtask] = useState('');
  const [subtasks, setSubtasks] = useState<{ title: string; completed: boolean }[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (existingTask) {
      setForm({
        title: existingTask.title || '',
        description: existingTask.description || '',
        status: existingTask.status || 'pending',
        priority: existingTask.priority || 'medium',
        dueDate: existingTask.dueDate ? existingTask.dueDate.slice(0, 10) : '',
        category: existingTask.category || 'work',
        tags: existingTask.tags || [],
        estimatedTime: existingTask.estimatedTime || 0,
        isRecurring: existingTask.isRecurring || false,
        recurringInterval: existingTask.recurringInterval || 'weekly',
      });
      setSubtasks(existingTask.subtasks || []);
    }
  }, [existingTask]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setForm(prev => ({ ...prev, [name]: checked }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const addSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks(prev => [...prev, { title: newSubtask.trim(), completed: false }]);
    setNewSubtask('');
  };

  const removeSubtask = (index: number) => {
    setSubtasks(prev => prev.filter((_, i) => i !== index));
  };

  const addTag = (tag: string) => {
    if (!tag.trim() || form.tags.includes(tag)) return;
    setForm(prev => ({ ...prev, tags: [...prev.tags, tag] }));
    setTagInput('');
    setShowTagSuggestions(false);
  };

  const removeTag = (tag: string) => {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const handleAIParse = async () => {
    if (!form.title.trim()) return;
    setAiLoading(true);
    try {
      const { data } = await aiAPI.parseTask(form.title);
      if (data.title) setForm(prev => ({ ...prev, title: data.title }));
      if (data.description) setForm(prev => ({ ...prev, description: prev.description || data.description }));
      if (data.priority) setForm(prev => ({ ...prev, priority: data.priority }));
      if (data.dueDate) setForm(prev => ({ ...prev, dueDate: data.dueDate.slice(0, 10) }));
      if (data.tags) setForm(prev => ({ ...prev, tags: [...new Set([...prev.tags, ...data.tags])] }));
      if (data.category) setForm(prev => ({ ...prev, category: data.category }));
      if (data.estimatedTime) setForm(prev => ({ ...prev, estimatedTime: data.estimatedTime }));
      toast.success('AI parsed your task!');
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
      if (data.subtasks) {
        setSubtasks(prev => [...prev, ...data.subtasks.map((s: any) => ({ title: s.title, completed: false }))]);
        toast.success('AI subtasks generated!');
      }
    } catch {
      toast.error('AI breakdown unavailable');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSubmitting(true);

    try {
      const payload = {
        ...form,
        dueDate: form.dueDate || null,
        tags: form.tags,
        subtasks,
        estimatedTime: form.estimatedTime || 0,
      };

      let data: any;
      if (existingTask) {
        ({ data } = await updateTask(existingTask._id, payload));
        toast.success('Task updated');
      } else {
        ({ data } = await createTask(payload));
        toast.success('Task created');
      }
      onSuccess(data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* AI Parse Button */}
      <button
        type="button"
        onClick={handleAIParse}
        disabled={aiLoading || !form.title}
        className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 transition-colors mb-2"
      >
        <Sparkles size={12} className={aiLoading ? 'animate-spin' : ''} />
        {aiLoading ? 'AI processing...' : '✨ AI auto-fill from title'}
      </button>

      {/* Title */}
      <div>
        <input
          name="title"
          value={form.title}
          onChange={handleChange}
          placeholder="Task title..."
          className="input-field text-base font-medium"
          autoFocus
        />
      </div>

      {/* Description */}
      <div>
        <textarea
          name="description"
          value={form.description}
          onChange={handleChange}
          placeholder="Add description..."
          rows={3}
          className="input-field resize-none"
        />
      </div>

      {/* Status & Priority */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select name="status" value={form.status} onChange={handleChange} className="input-field">
            {statusOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
          <select name="priority" value={form.priority} onChange={handleChange} className="input-field">
            {priorityOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Due Date & Category */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            <Calendar size={12} className="inline mr-1" />
            Due Date
          </label>
          <input type="date" name="dueDate" value={form.dueDate} onChange={handleChange} className="input-field" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
          <select name="category" value={form.category} onChange={handleChange} className="input-field">
            {categoryOptions.map(o => (
              <option key={o} value={o} className="capitalize">{o.charAt(0).toUpperCase() + o.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Estimated Time & Recurring */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            <Clock size={12} className="inline mr-1" />
            Est. Time (min)
          </label>
          <input type="number" name="estimatedTime" value={form.estimatedTime} onChange={handleChange} min="0" className="input-field" />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="isRecurring"
              checked={form.isRecurring}
              onChange={handleChange}
              className="rounded border-gray-300 dark:border-gray-600 text-yellow-500 focus:ring-yellow-500"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              <Repeat size={14} className="inline mr-1" />
              Repeat
            </span>
          </label>
          {form.isRecurring && (
            <select name="recurringInterval" value={form.recurringInterval} onChange={handleChange} className="input-field ml-2">
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          )}
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          <Tag size={12} className="inline mr-1" />
          Tags
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {form.tags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
              {tag}
              <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-500">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <div className="relative">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => { setTagInput(e.target.value); setShowTagSuggestions(true); }}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag(tagInput))}
            placeholder="Add tag and press Enter..."
            className="input-field"
          />
          {showTagSuggestions && tagInput && (
            <div className="absolute z-10 mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-1">
              {tagOptions.filter(t => t.includes(tagInput.toLowerCase()) && !form.tags.includes(t)).map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => addTag(tag)}
                  className="w-full rounded-lg px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors capitalize"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Subtasks */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-gray-500">Subtasks</label>
          {existingTask && (
            <button type="button" onClick={handleAIBreakdown} disabled={aiLoading} className="text-xs text-purple-500 hover:text-purple-600 flex items-center gap-1">
              <Sparkles size={10} className={aiLoading ? 'animate-spin' : ''} />
              AI breakdown
            </button>
          )}
        </div>
        <div className="space-y-1.5 mb-2">
          {subtasks.map((sub, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2"
            >
              <input
                type="checkbox"
                checked={sub.completed}
                onChange={() => setSubtasks(prev => prev.map((s, j) => j === i ? { ...s, completed: !s.completed } : s))}
                className="rounded border-gray-300 dark:border-gray-600 text-yellow-500 focus:ring-yellow-500"
              />
              <span className={cn('flex-1 text-sm', sub.completed && 'line-through text-gray-400')}>{sub.title}</span>
              <button type="button" onClick={() => removeSubtask(i)} className="text-gray-400 hover:text-red-500">
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSubtask())}
            placeholder="Add subtask..."
            className="input-field flex-1"
          />
          <button type="button" onClick={addSubtask} className="btn-secondary px-3">
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
        <button type="button" onClick={onCancel} className="btn-ghost px-4 py-2">
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary flex items-center gap-2"
        >
          {submitting && <Loader2 size={16} className="animate-spin" />}
          {submitting ? 'Saving...' : existingTask ? 'Update Task' : 'Create Task'}
        </button>
      </div>
    </form>
  );
}
