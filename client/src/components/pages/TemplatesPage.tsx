import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Search, Star, Copy, Trash2, Share2, Plus, Loader2, Sparkles } from 'lucide-react';
import { templatesAPI, createTask } from '@/api/tasks';
import { TemplateModal } from '@/components/templates/TemplateModal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface Template {
  _id: string;
  title: string;
  description?: string;
  category?: string;
  priority?: string;
  status?: string;
  estimatedTime?: number;
  subtasks?: { title: string; completed: boolean; order: number }[];
  tags?: string[];
  isShared?: boolean;
  sharedWith?: string[];
  usageCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const { data } = await templatesAPI.list();
      setTemplates(data?.templates || []);
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (data: any) => {
    try {
      const { data: res } = await templatesAPI.create(data);
      setTemplates(prev => [res.template, ...prev]);
      toast.success('Template created');
      setShowModal(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create template');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    try {
      await templatesAPI.remove(id);
      setTemplates(prev => prev.filter(t => t._id !== id));
      toast.success('Template deleted');
    } catch {
      toast.error('Failed to delete template');
    }
  };

  const handleApply = async (template: Template) => {
    setApplying(template._id);
    try {
      // First increment the usage count via the dedicated endpoint,
      // then create a real task from the template data.
      await templatesAPI.apply(template._id);
      const { data: created } = await createTask({
        title: template.title,
        description: template.description || '',
        priority: template.priority || 'medium',
        status: template.status || 'pending',
        category: template.category || 'uncategorized',
        tags: template.tags || [],
        estimatedTime: template.estimatedTime || 0,
        subtasks: (template.subtasks || []).map((s) => ({
          title: s.title,
          completed: false,
        })),
      });
      toast.success(`Task "${created.title}" created from template`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to apply template');
    } finally {
      setApplying(null);
    }
  };

  const handleCopy = async (id: string) => {
    try {
      const { data } = await templatesAPI.copy(id);
      setTemplates(prev => [data.template, ...prev]);
      toast.success('Template copied');
    } catch {
      toast.error('Failed to copy template');
    }
  };

  const filtered = templates.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q) ||
      (t.tags || []).some(tag => tag.toLowerCase().includes(q))
    );
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 lg:p-6 max-w-5xl mx-auto"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Star size={24} className="text-yellow-500 fill-yellow-500" />
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Templates</h2>
            <p className="text-sm text-gray-400">
              {templates.length} template{templates.length === 1 ? '' : 's'} — save and reuse task structures
            </p>
          </div>
        </div>
        <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />}>
          New Template
        </Button>
      </div>

      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="input-field pl-9 w-full"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-yellow-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <Sparkles size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            {templates.length === 0
              ? 'No templates yet. Create your first one!'
              : 'No templates match your search.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(t => (
            <motion.div
              key={t._id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-5 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{t.title}</h3>
                  {t.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
                      {t.description}
                    </p>
                  )}
                </div>
                {t.isShared && (
                  <span title="Shared with team" className="rounded-md bg-blue-50 dark:bg-blue-500/10 p-1 text-blue-500">
                    <Share2 size={14} />
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[10px]">
                {t.category && (
                  <span className="rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-gray-600 dark:text-gray-300">
                    {t.category}
                  </span>
                )}
                {t.priority && (
                  <span className={cn(
                    'rounded-md px-2 py-0.5 font-medium',
                    t.priority === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                    t.priority === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                    t.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  )}>
                    {t.priority}
                  </span>
                )}
                {t.subtasks && t.subtasks.length > 0 && (
                  <span className="rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-gray-600 dark:text-gray-300">
                    {t.subtasks.length} subtask{t.subtasks.length === 1 ? '' : 's'}
                  </span>
                )}
                {typeof t.usageCount === 'number' && t.usageCount > 0 && (
                  <span className="rounded-md bg-yellow-50 dark:bg-yellow-500/10 px-2 py-0.5 text-yellow-700 dark:text-yellow-400">
                    Used {t.usageCount}×
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleApply(t)}
                  loading={applying === t._id}
                  icon={<Plus size={14} />}
                >
                  Use
                </Button>
                <button
                  onClick={() => handleCopy(t._id)}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Duplicate"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => handleDelete(t._id)}
                  className="ml-auto rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <TemplateModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleCreate}
      />
    </motion.div>
  );
}
