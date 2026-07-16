import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, CheckCircle2, Clock, AlertCircle, Trash2, ChevronDown, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BulkActionsBarProps {
  selectedCount: number;
  totalTasks: number;
  selectedStatus?: string;
  onSelectStatus?: (status: string) => void;
  onSelectPriority?: (priority: string) => void;
  onSelectTags?: (tag: string) => void;
  onDelete?: () => void;
  onClose?: () => void;
  existingTags?: string[];
  theme?: 'dark' | 'light';
}

export function BulkActionsBar({
  selectedCount,
  totalTasks,
  selectedStatus,
  onSelectStatus,
  onSelectPriority,
  onSelectTags,
  onDelete,
  onClose,
  existingTags = [],
  theme = 'dark',
}: BulkActionsBarProps) {
  const statuses = ['backlog', 'pending', 'in-progress', 'completed', 'blocked', 'review', 'cancelled'];
  const priorities = ['critical', 'high', 'medium', 'low', 'none'];
  const [tagInput, setTagInput] = useState('');
  const [tagOpen, setTagOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const isFullySelected = selectedCount === totalTasks && totalTasks > 0;
  const isPartiallySelected = selectedCount > 0 && selectedCount < totalTasks;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 border-t shadow-2xl',
        theme === 'dark' ? 'bg-gray-900/95 border-gray-700 text-white' : 'bg-white/95 border-gray-200 text-gray-900'
      )}
    >
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Selection Info */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-gray-800/50 dark:bg-white/10 rounded-xl px-4 py-2">
              {isFullySelected ? (
                <div className="flex items-center gap-2 text-yellow-400">
                  <CheckCircle2 size={20} />
                  <span className="font-semibold">{selectedCount} tasks selected</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 dark:text-gray-300">{selectedCount} selected</span>
                </div>
              )}
              
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-700/50 dark:hover:bg-white/20 transition-colors"
              aria-label="Clear selection"
            >
              <X size={18} />
            </button>
          </div>
        </div>

          {/* Bulk Actions */}
          <div className="flex items-center gap-2">
            {/* Status Change */}
            {onSelectStatus && (
              <div className="relative group">
                <button
                  type="button"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800/50 dark:bg-white/10 hover:bg-gray-700/50 dark:hover:bg-white/20 transition-colors"
                >
                  <Clock size={18} className="text-gray-400" />
                  <span>Set Status</span>
                  <ChevronDown size={16} className="text-gray-500" />
                </button>

                <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                  <div className={cn(
                    'py-2 backdrop-blur-md',
                    theme === 'dark' ? 'bg-gray-800/95 border-gray-700' : 'bg-white/95 border-gray-200'
                  )}>
                    {statuses.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => { onSelectStatus(status); onClose?.(); }}
                        className={cn(
                          'w-full text-left px-4 py-2.5 text-sm hover:bg-gray-700/50 dark:hover:bg-white/10 transition-colors flex items-center gap-2',
                          selectedStatus === status && 'text-yellow-500 font-medium'
                        )}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Priority Change */}
            {onSelectPriority && (
              <div className="relative group">
                <button
                  type="button"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800/50 dark:bg-white/10 hover:bg-gray-700/50 dark:hover:bg-white/20 transition-colors"
                >
                  <AlertCircle size={18} className="text-gray-400" />
                  <span>Set Priority</span>
                  <ChevronDown size={16} className="text-gray-500" />
                </button>

                <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                  <div className={cn(
                    'py-2 backdrop-blur-md',
                    theme === 'dark' ? 'bg-gray-800/95 border-gray-700' : 'bg-white/95 border-gray-200'
                  )}>
                    {priorities.map((priority) => (
                      <button
                        key={priority}
                        type="button"
                        onClick={() => { onSelectPriority(priority); onClose?.(); }}
                        className={cn(
                          'w-full text-left px-4 py-2.5 text-sm hover:bg-gray-700/50 dark:hover:bg-white/10 transition-colors flex items-center gap-2',
                          selectedStatus === priority && 'text-yellow-500 font-medium'
                        )}
                      >
                        {priority}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Delete */}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors"
              >
                <Trash2 size={18} />
                <span>Delete</span>
              </button>
            )}

            {/* Tags */}
            {onSelectTags && (
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => { setTagOpen(o => !o); setTagInput(''); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800/50 dark:bg-white/10 hover:bg-gray-700/50 dark:hover:bg-white/20 transition-colors"
                >
                  <Tag size={18} className="text-gray-400" />
                  <span>Tags</span>
                  <ChevronDown size={16} className="text-gray-500" />
                </button>

                <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <div className={cn(
                    'p-3 space-y-2 backdrop-blur-md',
                    theme === 'dark' ? 'bg-gray-800/95 border-gray-700' : 'bg-white/95 border-gray-200'
                  )}>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide px-1">Add tag to selected</p>

                    {/* Tag input */}
                    <div className="flex gap-1.5">
                      <input
                        ref={tagInputRef}
                        type="text"
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && tagInput.trim()) {
                            onSelectTags(tagInput.trim());
                            setTagInput('');
                            setTagOpen(false);
                            onClose?.();
                          }
                        }}
                        placeholder="Tag name..."
                        className={cn(
                          'flex-1 px-2.5 py-1.5 rounded-lg text-sm outline-none border transition-colors',
                          theme === 'dark'
                            ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-500 focus:border-yellow-500'
                            : 'bg-gray-100 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-yellow-500'
                        )}
                      />
                      <button
                        type="button"
                        disabled={!tagInput.trim()}
                        onClick={() => {
                          if (tagInput.trim()) {
                            onSelectTags(tagInput.trim());
                            setTagInput('');
                            setTagOpen(false);
                            onClose?.();
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-yellow-400 text-gray-900 text-sm font-medium hover:bg-yellow-500 disabled:opacity-40 transition-colors"
                      >
                        Add
                      </button>
                    </div>

                    {/* Existing tag suggestions */}
                    {existingTags.length > 0 && (
                      <>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide px-1 pt-1">Existing tags</p>
                        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                          {existingTags.map(tag => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                onSelectTags(tag);
                                setTagOpen(false);
                                onClose?.();
                              }}
                              className={cn(
                                'px-2 py-0.5 rounded-md text-xs font-medium border transition-colors hover:scale-105',
                                theme === 'dark'
                                  ? 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-yellow-500 hover:text-yellow-400'
                                  : 'bg-gray-100 border-gray-200 text-gray-600 hover:border-yellow-500 hover:text-yellow-700'
                              )}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-gray-700/50 dark:bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-yellow-400 transition-all duration-300"
              style={{ width: `${(selectedCount / totalTasks) * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">
            {selectedCount} of {totalTasks} selected
          </span>
        </div>
      </div>
    </motion.div>
  );
}
