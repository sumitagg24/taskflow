import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, CheckCircle2, Star, Trash2, Share2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (template: any) => void;
  theme?: 'dark' | 'light';
}

interface TemplateData {
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  estimatedTime: number;
  subtasks: { title: string; completed: boolean; order: number }[];
  tags: string[];
  isShared: boolean;
}

export function TemplateModal({ isOpen, onClose, onSave, theme = 'dark' }: TemplateModalProps) {
  const { user } = useAuth();
  const [data, setData] = useState<TemplateData>({
    title: '',
    description: '',
    category: 'uncategorized',
    priority: 'medium',
    status: 'pending',
    estimatedTime: 0,
    subtasks: [],
    tags: [],
    isShared: false,
  });
  const [newSubtask, setNewSubtask] = useState('');
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Reset form on open
      setData({
        title: '',
        description: '',
        category: 'uncategorized',
        priority: 'medium',
        status: 'pending',
        estimatedTime: 0,
        subtasks: [],
        tags: [],
        isShared: false,
      });
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave?.(data);
    onClose();
  };

  const addSubtask = () => {
    if (newSubtask.trim()) {
      setData(prev => ({
        ...prev,
        subtasks: [
          ...prev.subtasks,
          { title: newSubtask, completed: false, order: prev.subtasks.length },
        ],
      }));
      setNewSubtask('');
    }
  };

  const removeSubtask = (index: number) => {
    setData(prev => ({
      ...prev,
      subtasks: prev.subtasks.filter((_, i) => i !== index),
    }));
  };

  const addTag = () => {
    if (newTag.trim() && !data.tags.includes(newTag.trim())) {
      setData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()],
      }));
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tagToRemove),
    }));
  };

  const categories = ['work', 'personal', 'college', 'projects', 'fitness', 'shopping', 'finance', 'learning', 'uncategorized'];
  const priorities = ['critical', 'high', 'medium', 'low', 'none'];
  const statuses = ['backlog', 'pending', 'in-progress', 'completed', 'blocked', 'review', 'cancelled'];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={cn(
          'relative w-full max-w-2xl rounded-2xl border shadow-2xl max-h-[90vh] overflow-hidden',
          theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800/50 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-400">
              <Star size={16} className="text-gray-900" />
            </div>
            <h2 className="text-lg font-semibold">Create Template</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-800/50 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto">
          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Template Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={data.title}
                onChange={(e) => setData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter template name"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={data.description}
                onChange={(e) => setData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe this template..."
                className={cn(
                  'w-full bg-gray-50 dark:bg-gray-800/50 border rounded-xl px-3 py-2.5 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500',
                  theme === 'dark' ? 'border-gray-700 text-gray-100' : 'border-gray-200 text-gray-900'
                )}
                rows={3}
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium mb-2">Category</label>
              <div className="flex flex-wrap gap-2">
                {categories.map(category => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setData(prev => ({ ...prev, category }))}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                      data.category === category
                        ? 'bg-yellow-400 text-gray-900'
                        : theme === 'dark'
                          ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium mb-2">Priority</label>
              <div className="flex flex-wrap gap-2">
                {priorities.map(priority => (
                  <button
                    key={priority}
                    type="button"
                    onClick={() => setData(prev => ({ ...prev, priority }))}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                      data.priority === priority
                        ? 'bg-yellow-400 text-gray-900'
                        : theme === 'dark'
                          ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    {priority}
                  </button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium mb-2">Status</label>
              <div className="flex flex-wrap gap-2">
                {statuses.map(status => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setData(prev => ({ ...prev, status }))}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                      data.status === status
                        ? 'bg-yellow-400 text-gray-900'
                        : theme === 'dark'
                          ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* Subtasks */}
            <div>
              <label className="block text-sm font-medium mb-2">Subtasks</label>
              <div className="space-y-2">
                {data.subtasks.map((subtask, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2"
                  >
                    <CheckCircle2 size={16} className="text-gray-400" />
                    <span className="text-sm flex-1">{subtask.title}</span>
                    <button
                      type="button"
                      onClick={() => removeSubtask(index)}
                      className="p-1 rounded hover:bg-red-500/20 text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Input
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } }}
                  placeholder="Add a subtask..."
                  className="text-sm"
                />
                <button
                  type="button"
                  onClick={addSubtask}
                  className="px-4 py-2 rounded-xl bg-gray-800 text-white hover:bg-gray-700 transition-colors"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium mb-2">Tags</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {data.tags.map(tag => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800/50 px-2.5 py-1 rounded-lg text-sm"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-red-500"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Add a tag..."
                className="text-sm"
              />
            </div>

            {/* Shared */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
              <div>
                <p className="font-medium">Share Template</p>
                <p className="text-xs text-gray-500">Make this template available to your team</p>
              </div>
              <button
                type="button"
                onClick={() => setData(prev => ({ ...prev, isShared: !prev.isShared }))}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200',
                  data.isShared ? 'bg-yellow-400 text-gray-900' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                )}
              >
                <Share2 size={18} />
                {data.isShared ? 'Shared' : 'Private'}
              </button>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-800/50 p-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl hover:bg-gray-800/50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={!data.title.trim()}
            className="px-6 py-2 rounded-xl bg-yellow-400 text-gray-900 font-semibold hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            Save Template
          </button>
        </div>
      </motion.div>
    </div>
  );
}
