import { motion } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: 'dark' | 'light';
}

const shortcuts = [
  {
    category: 'General',
    items: [
      { keys: ['?'], action: 'Open this shortcuts modal' },
      { keys: ['Esc'], action: 'Close modal or dialog' },
      { keys: ['j', 'k'], action: 'Navigate between tasks' },
      { keys: ['Enter'], action: 'Open selected task' },
      { keys: ['s'], action: 'Search tasks' },
    ],
  },
  {
    category: 'Task Management',
    items: [
      { keys: ['n'], action: 'Create new task' },
      { keys: ['e'], action: 'Edit selected task' },
      { keys: ['d'], action: 'Delete selected task' },
      { keys: ['f'], action: 'Toggle favorite' },
      { keys: ['c'], action: 'Add comment' },
      { keys: ['t'], action: 'Toggle status (pending → in-progress → completed)' },
    ],
  },
  {
    category: 'Time Tracking',
    items: [
      { keys: ['w'], action: 'Start focus timer' },
      { keys: ['Shift + w'], action: 'Stop focus timer' },
      { keys: ['p'], action: 'Pause/resume timer' },
    ],
  },
  {
    category: 'Navigation',
    items: [
      { keys: ['g', 'd'], action: 'Go to Dashboard' },
      { keys: ['g', 't'], action: 'Go to Tasks' },
      { keys: ['g', 'a'], action: 'Go to Analytics' },
      { keys: ['g', 'c'], action: 'Go to Calendar' },
      { keys: ['g', 's'], action: 'Go to Settings' },
    ],
  },
];

export function ShortcutsModal({ isOpen, onClose, theme = 'dark' }: ShortcutsModalProps) {
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
          'relative w-full max-w-2xl rounded-2xl border shadow-2xl',
          theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800/50 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-400">
              <Keyboard size={20} className="text-gray-900" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Keyboard Shortcuts</h2>
              <p className="text-sm text-gray-500">Boost your productivity with keyboard shortcuts</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-800/50 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[70vh] overflow-y-auto p-6">
          <div className="space-y-6">
            {shortcuts.map((group) => (
              <div key={group.category}>
                <h3 className="text-sm font-semibold text-yellow-500 uppercase tracking-wider mb-3">
                  {group.category}
                </h3>
                <div className="space-y-3">
                  {group.items.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500">{index + 1}.</span>
                        <span className="text-gray-300 dark:text-gray-400">{item.action}</span>
                      </div>
                      <div className="flex gap-1.5">
                        {item.keys.map((key) => (
                          <kbd
                            key={key}
                            className={cn(
                              'px-2.5 py-1 rounded-lg text-sm font-mono font-medium',
                              theme === 'dark'
                                ? 'bg-gray-800 text-gray-300'
                                : 'bg-gray-100 text-gray-700'
                            )}
                          >
                            {key.length === 1 ? key.toUpperCase() : key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center border-t border-gray-800/50 p-4 bg-gray-900/50">
          <p className="text-xs text-gray-500">
            Press <kbd className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">Esc</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">?</kbd> to close
          </p>
        </div>
      </motion.div>
    </div>
  );
}
