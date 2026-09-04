import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  itemName?: string;
  loading?: boolean;
  /** Label for the destructive action — "Delete", "Move to Trash", "Purge". */
  confirmLabel?: string;
}

export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Delete task',
  message = 'This moves the task to Trash. You can restore it for 30 days.',
  itemName,
  loading = false,
  confirmLabel = 'Delete',
}: DeleteConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus lands on Cancel, not Delete: a stray Enter on a destructive dialog
  // should be a no-op, so the safe choice gets the default focus.
  useEffect(() => {
    if (!isOpen) return;
    const restore = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => cancelRef.current?.focus({ preventScroll: true }));

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        e.stopPropagation();
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.addEventListener('keydown', onKeyDown, true);
    document.body.style.overflow = 'hidden';

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restore?.focus?.({ preventScroll: true });
    };
  }, [isOpen, loading, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-gray-950/45 backdrop-blur-[2px]"
            onClick={loading ? undefined : onClose}
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            aria-describedby="delete-confirm-message"
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.17, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-sm rounded-2xl border border-gray-200 bg-card p-6 shadow-xl dark:border-gray-800"
          >
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/12">
                <AlertTriangle size={20} className="text-red-500" aria-hidden="true" />
              </div>
              <h3
                id="delete-confirm-title"
                className="font-display mb-1.5 text-xl text-gray-900 dark:text-gray-100"
              >
                {title}
              </h3>
              <p
                id="delete-confirm-message"
                className="text-sm leading-relaxed text-gray-500 dark:text-gray-400"
              >
                {message}
              </p>
              {itemName && (
                <p className="mt-3 max-w-full truncate rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  {itemName}
                </p>
              )}
            </div>

            <div className="mt-6 flex items-center gap-3">
              <Button
                ref={cancelRef}
                variant="outline"
                onClick={onClose}
                disabled={loading}
                fullWidth
              >
                Cancel
              </Button>
              <Button variant="danger" onClick={onConfirm} loading={loading} fullWidth>
                {loading ? 'Deleting…' : confirmLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
