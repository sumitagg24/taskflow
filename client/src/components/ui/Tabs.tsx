import { KeyboardEvent, ReactNode, useCallback, useId, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
  disabled?: boolean;
}

interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** `underline` for page-level nav, `pill` for panel-level switching. */
  variant?: 'underline' | 'pill';
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

/**
 * Roving-tabindex tablist: only the active tab is in the tab order, arrows move
 * between tabs. That's the WAI-ARIA pattern and keeps long rails keyboard-cheap.
 */
export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  variant = 'underline',
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: TabsProps<T>) {
  const autoId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
      if (!keys.includes(e.key)) return;
      e.preventDefault();

      const enabled = items.filter((i) => !i.disabled);
      if (enabled.length === 0) return;
      const current = enabled.findIndex((i) => i.id === value);

      let next = current;
      if (e.key === 'ArrowRight') next = (current + 1) % enabled.length;
      else if (e.key === 'ArrowLeft') next = (current - 1 + enabled.length) % enabled.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = enabled.length - 1;

      const target = enabled[next];
      if (!target) return;
      onChange(target.id);
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-tab-id="${target.id}"]`)
        ?.focus({ preventScroll: false });
    },
    [items, onChange, value]
  );

  const isUnderline = variant === 'underline';

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn(
        'no-scrollbar flex items-center overflow-x-auto',
        isUnderline
          ? 'gap-1 border-b border-gray-200 dark:border-gray-800'
          : 'gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800/60',
        className
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${autoId}-tab-${item.id}`}
            data-tab-id={item.id}
            aria-selected={active}
            aria-controls={`${autoId}-panel-${item.id}`}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-medium',
              'transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-45',
              size === 'sm' ? 'text-xs' : 'text-sm',
              isUnderline
                ? cn(
                    size === 'sm' ? 'px-2.5 pb-2 pt-1.5' : 'px-3 pb-2.5 pt-2',
                    '-mb-px border-b-2',
                    active
                      ? 'border-yellow-400 text-gray-900 dark:text-gray-50'
                      : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                  )
                : cn(
                    'rounded-md',
                    size === 'sm' ? 'h-7 px-2.5' : 'h-8 px-3',
                    active
                      ? 'bg-card text-gray-900 shadow-xs dark:text-gray-50'
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                  )
            )}
          >
            {item.icon && (
              <span className="shrink-0" aria-hidden="true">
                {item.icon}
              </span>
            )}
            {item.label}
            {item.count != null && (
              <span
                className={cn(
                  'ml-0.5 rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums',
                  active
                    ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Compact two-to-four-way switch — view mode, date range, sort direction. */
export function SegmentedControl<T extends string = string>({
  items,
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
}: {
  items: { id: T; label?: ReactNode; icon?: ReactNode; title?: string }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-card p-0.5 dark:border-gray-700',
        className
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            title={item.title}
            aria-pressed={active}
            aria-label={!item.label ? item.title : undefined}
            onClick={() => onChange(item.id)}
            className={cn(
              'inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
              active
                ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50'
                : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
            )}
          >
            {item.icon && <span aria-hidden="true">{item.icon}</span>}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
