import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Empty states carry the "why nothing is here" plus one primary action. A bare
 * "No results" line reads as a bug; an action makes it read as a state.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  size = 'md',
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const pad = size === 'sm' ? 'py-8' : size === 'lg' ? 'py-20' : 'py-14';

  return (
    <div className={cn('flex flex-col items-center px-6 text-center', pad, className)}>
      {icon && (
        <div
          aria-hidden="true"
          className={cn(
            'mb-4 flex items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800/70 dark:text-gray-500',
            size === 'sm' ? 'h-10 w-10' : 'h-14 w-14'
          )}
        >
          {icon}
        </div>
      )}
      <h3
        className={cn(
          'font-display text-gray-900 dark:text-gray-100',
          size === 'sm' ? 'text-base' : 'text-xl'
        )}
      >
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

export function Skeleton({
  className,
  rounded = 'md',
}: {
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}) {
  const radius = {
    sm: 'rounded',
    md: 'rounded-lg',
    lg: 'rounded-xl',
    full: 'rounded-full',
  }[rounded];

  return <div aria-hidden="true" className={cn('skeleton h-4 w-full', radius, className)} />;
}

/** Card-shaped loading placeholder used while a list is fetching. */
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('card p-5', className)} aria-hidden="true">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-5 w-3/4" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-1/2' : 'w-full')} />
        ))}
      </div>
    </div>
  );
}

/** Screen-reader announcement for async regions that render skeletons. */
export function LoadingRegion({ label = 'Loading', children }: { label?: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only-focusable">{label}</span>
      {children}
    </div>
  );
}

const AVATAR_TONES = [
  'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/18 dark:text-yellow-200',
  'bg-blue-100 text-blue-800 dark:bg-blue-500/18 dark:text-blue-200',
  'bg-green-100 text-green-800 dark:bg-green-500/18 dark:text-green-200',
  'bg-purple-100 text-purple-800 dark:bg-purple-500/18 dark:text-purple-200',
  'bg-orange-100 text-orange-800 dark:bg-orange-500/18 dark:text-orange-200',
  'bg-teal-100 text-teal-700 dark:bg-teal-500/18 dark:text-teal-200',
];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic tone so the same person keeps the same color across renders. */
function toneOf(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

const avatarSizes = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

export function Avatar({
  name,
  src,
  size = 'md',
  className,
  title,
}: {
  name?: string | null;
  src?: string | null;
  size?: keyof typeof avatarSizes;
  className?: string;
  title?: string;
}) {
  const label = name?.trim() || 'Unassigned';

  if (src) {
    return (
      <img
        src={src}
        alt={label}
        title={title ?? label}
        className={cn(
          'shrink-0 rounded-full border border-gray-200 object-cover dark:border-gray-700',
          avatarSizes[size],
          className
        )}
      />
    );
  }

  return (
    <span
      title={title ?? label}
      aria-label={label}
      role="img"
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold',
        avatarSizes[size],
        toneOf(label),
        className
      )}
    >
      {initialsOf(label)}
    </span>
  );
}

/** Overlapping avatar row with a "+N" overflow chip. */
export function AvatarGroup({
  names,
  max = 3,
  size = 'sm',
  className,
}: {
  names: string[];
  max?: number;
  size?: keyof typeof avatarSizes;
  className?: string;
}) {
  const shown = names.slice(0, max);
  const overflow = names.length - shown.length;

  return (
    <div className={cn('flex items-center', className)}>
      {shown.map((n, i) => (
        <Avatar
          key={`${n}-${i}`}
          name={n}
          size={size}
          className={cn('ring-2 ring-card', i > 0 && '-ml-2')}
        />
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            '-ml-2 inline-flex items-center justify-center rounded-full bg-gray-100 font-semibold text-gray-600 ring-2 ring-card dark:bg-gray-800 dark:text-gray-300',
            avatarSizes[size]
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
