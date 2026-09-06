import { useEffect, useId, useRef, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
  /** Footer pinned below the scroll area — action rows shouldn't scroll away. */
  footer?: ReactNode;
  /** Set false for destructive flows where a stray backdrop click would hurt. */
  closeOnBackdrop?: boolean;
  /**
   * `right` turns the panel into a full-height side drawer. It reuses every bit
   * of dialog machinery below (focus trap, Escape, scroll lock, focus restore)
   * — only the framing and the entry animation differ.
   * `bottom` turns it into a phone bottom sheet: full-width, slide-up, capped
   * at 92dvh with rounded top corners and safe-area padding. On `sm:` screens
   * and up it falls back to a centred dialog so desktop callers stay unchanged.
   */
  placement?: 'center' | 'right' | 'bottom';
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-3xl',
};

// A centred dialog floats and is capped in height; a drawer is flush to the
// right edge and owns the full viewport height; a bottom sheet is flush to
// the bottom edge, full-width, and capped at 92dvh. `dvh` units keep sheets
// clear of the mobile browser chrome as it expands/collapses.
const placementClasses = {
  center: {
    container: 'items-center justify-center p-4 sm:p-6',
    panel: 'max-h-[calc(100dvh-3rem)] rounded-2xl border border-gray-200 dark:border-gray-800',
  },
  right: {
    container: 'justify-end',
    panel: 'h-dvh rounded-none border-l border-gray-200 dark:border-gray-800',
  },
  bottom: {
    container: 'items-end justify-center sm:items-center sm:p-6',
    panel:
      'max-h-[92dvh] rounded-t-3xl border-x border-t border-gray-200 pb-[env(safe-area-inset-bottom)] sm:rounded-2xl sm:border dark:border-gray-800',
  },
};

const panelMotion = {
  center: {
    initial: { opacity: 0, scale: 0.98, y: 12 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.98, y: 8 },
  },
  right: {
    initial: { opacity: 0, x: 28 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 24 },
  },
  bottom: {
    initial: { opacity: 0, y: 56 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 40 },
  },
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = 'lg',
  className,
  footer,
  closeOnBackdrop = true,
  placement = 'center',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const autoId = useId();
  const titleId = `modal-title-${autoId}`;
  const subtitleId = `modal-subtitle-${autoId}`;

  // Escape to close, Tab cycles inside the panel. Without the trap, tabbing
  // walks into the page behind the backdrop, which screen readers then read.
  useEffect(() => {
    if (!isOpen) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (nodes.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.addEventListener('keydown', handleKeyDown, true);
    document.body.style.overflow = 'hidden';

    const raf = requestAnimationFrame(() => {
      const target =
        panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panelRef.current ?? null;
      target?.focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={cn('fixed inset-0 z-50 flex', placementClasses[placement].container)}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-gray-950/45 backdrop-blur-[2px]"
            onClick={closeOnBackdrop ? onClose : undefined}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={subtitle ? subtitleId : undefined}
            tabIndex={-1}
            {...panelMotion[placement]}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'relative flex w-full flex-col overflow-hidden bg-card shadow-xl outline-none',
              placementClasses[placement].panel,
              sizeClasses[size],
              className
            )}
          >
            {(title || subtitle) && (
              <header className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
                <div className="min-w-0">
                  {title && (
                    <h2
                      id={titleId}
                      className="font-display truncate text-xl text-gray-900 dark:text-gray-100"
                    >
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p id={subtitleId} className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                      {subtitle}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="-mr-1.5 -mt-0.5 shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </header>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && (
              <footer className="shrink-0 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
