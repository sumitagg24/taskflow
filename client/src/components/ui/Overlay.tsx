import {
  ReactNode,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type Side = 'top' | 'bottom' | 'left' | 'right';

/**
 * Portal-rendered tooltip positioned from the trigger's viewport rect, so it
 * escapes `overflow: hidden` ancestors (kanban rails, scrolling sidebars) that
 * would otherwise clip an absolutely-positioned bubble.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  delay = 250,
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: Side;
  delay?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const id = useId();

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    const map: Record<Side, { top: number; left: number }> = {
      top: { top: r.top - gap, left: r.left + r.width / 2 },
      bottom: { top: r.bottom + gap, left: r.left + r.width / 2 },
      left: { top: r.top + r.height / 2, left: r.left - gap },
      right: { top: r.top + r.height / 2, left: r.right + gap },
    };
    setCoords(map[side]);
  }, [side]);

  const show = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      place();
      setOpen(true);
    }, delay);
  }, [delay, place]);

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setOpen(false);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => hide();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, hide]);

  const transform: Record<Side, string> = {
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)',
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={open ? id : undefined}
        className="contents"
      >
        {children}
      </span>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && coords && content && (
              <motion.div
                id={id}
                role="tooltip"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.12 }}
                style={{ top: coords.top, left: coords.left, transform: transform[side] }}
                className={cn(
                  'pointer-events-none fixed z-[100] max-w-xs rounded-lg bg-gray-900 px-2.5 py-1.5',
                  'text-xs font-medium text-gray-50 shadow-lg dark:bg-gray-100 dark:text-gray-900',
                  className
                )}
              >
                {content}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

export interface DropdownItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Renders a hairline divider above this item. */
  separatorBefore?: boolean;
  shortcut?: string;
}

/**
 * Click-triggered menu. Positioned in a portal for the same clipping reason as
 * Tooltip, with arrow-key navigation and outside-click / Escape dismissal.
 */
export function DropdownMenu({
  trigger,
  items,
  align = 'end',
  className,
  menuClassName,
}: {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: 'start' | 'end';
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; minWidth: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const enabled = items.filter((i) => !i.disabled);

  const place = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 180);
    const left = align === 'end' ? r.right - width : r.left;
    setCoords({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
      minWidth: width,
    });
  }, [align]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    place();
    setActiveIndex(-1);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => {
          if (enabled.length === 0) return -1;
          const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
          return ((next % enabled.length) + enabled.length) % enabled.length;
        });
        return;
      }
      if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        const item = enabled[activeIndex];
        if (item) {
          setOpen(false);
          item.onSelect?.();
        }
      }
    };
    const onScrollOrResize = () => setOpen(false);

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, enabled, activeIndex]);

  const triggerNode = isValidElement(trigger)
    ? cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          toggle();
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
      })
    : trigger;

  return (
    <div ref={wrapRef} className={cn('relative inline-flex', className)}>
      {triggerNode}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && coords && (
              <motion.div
                ref={menuRef}
                role="menu"
                initial={{ opacity: 0, scale: 0.97, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: -4 }}
                transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                style={{ top: coords.top, left: coords.left, minWidth: coords.minWidth }}
                className={cn(
                  'fixed z-[90] max-h-[70vh] overflow-y-auto rounded-xl border border-gray-200 bg-card p-1 shadow-xl',
                  'dark:border-gray-700',
                  menuClassName
                )}
              >
                {items.map((item) => {
                  const idx = enabled.indexOf(item);
                  const active = idx >= 0 && idx === activeIndex;
                  return (
                    <div key={item.id}>
                      {item.separatorBefore && <div className="my-1 h-px bg-gray-100 dark:bg-gray-800" />}
                      <button
                        type="button"
                        role="menuitem"
                        disabled={item.disabled}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpen(false);
                          item.onSelect?.();
                        }}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                          'disabled:cursor-not-allowed disabled:opacity-45',
                          item.danger
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-gray-700 dark:text-gray-200',
                          active &&
                            (item.danger
                              ? 'bg-red-50 dark:bg-red-500/12'
                              : 'bg-gray-100 dark:bg-gray-800'),
                          !active && 'hover:bg-gray-100 dark:hover:bg-gray-800'
                        )}
                      >
                        {item.icon && (
                          <span className="shrink-0 opacity-80" aria-hidden="true">
                            {item.icon}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.shortcut && (
                          <span className="shrink-0 text-[11px] text-gray-400">{item.shortcut}</span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
