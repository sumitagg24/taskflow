import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Command } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const shortcuts = [
  { keys: ['⌘', 'K'], description: 'Focus search bar' },
  { keys: ['⌘', 'N'], description: 'Create new task' },
  { keys: ['Esc'], description: 'Close modals / panels' },
  { keys: ['?'], description: 'Show keyboard shortcuts' },
  { keys: ['↑', '↓'], description: 'Navigate items' },
  { keys: ['Enter'], description: 'Confirm / Submit' },
];

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, isOpen, onClose);
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={cn(
              'relative w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800',
              'bg-white dark:bg-[#1a1a23] shadow-2xl overflow-hidden'
            )}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Command size={18} className="text-yellow-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Keyboard Shortcuts</h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-3">
              {shortcuts.map((shortcut, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{shortcut.description}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, j) => (
                      <span key={j} className="inline-flex items-center justify-center min-w-[28px] h-7 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">
                        {key}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
              <p className="text-[11px] text-gray-400 text-center">
                Press <kbd className="inline-flex items-center rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium">?</kbd> anytime to open this menu
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
