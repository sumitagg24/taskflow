import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * One page header for every list-style route (Today, Inbox, Calendar,
 * Categories, Trash, Templates). Eyebrow + serif title + count on the left,
 * at most two actions on the right — no bespoke headers.
 */
export function PageHeader({
  eyebrow,
  title,
  count,
  subtitle,
  primary,
  secondary,
  className,
}: {
  eyebrow: string;
  title: string;
  count?: number | null;
  subtitle?: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <p className="caption-upper">{eyebrow}</p>
        <h1 className="font-display mt-1 text-2xl leading-tight text-gray-900 sm:text-3xl dark:text-gray-100">
          {title}
          {count != null && (
            <span className="ml-2 align-middle font-sans text-sm font-medium tabular-nums text-gray-500 dark:text-gray-400">
              {count}
            </span>
          )}
        </h1>
        {subtitle && <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      {(primary || secondary) && (
        <div className="flex shrink-0 items-center gap-2">
          {secondary}
          {primary}
        </div>
      )}
    </div>
  );
}
