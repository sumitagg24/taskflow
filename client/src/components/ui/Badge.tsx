import { cn } from '@/lib/utils';

export interface BadgeProps {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'outline';
  size?: 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
}

const variants = {
  default: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  primary: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/12 dark:text-yellow-300',
  success: 'bg-green-50 text-green-700 dark:bg-green-500/12 dark:text-green-300',
  warning: 'bg-orange-50 text-orange-700 dark:bg-orange-500/12 dark:text-orange-300',
  danger: 'bg-red-50 text-red-700 dark:bg-red-500/12 dark:text-red-300',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-500/12 dark:text-blue-300',
  muted: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  outline: 'border border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-400',
};

const statusVariants: Record<string, string> = {
  backlog: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  pending: 'bg-blue-50 text-blue-700 dark:bg-blue-500/12 dark:text-blue-300',
  'in-progress': 'bg-orange-50 text-orange-700 dark:bg-orange-500/12 dark:text-orange-300',
  completed: 'bg-green-50 text-green-700 dark:bg-green-500/12 dark:text-green-300',
  blocked: 'bg-red-50 text-red-700 dark:bg-red-500/12 dark:text-red-300',
  review: 'bg-purple-50 text-purple-700 dark:bg-purple-500/12 dark:text-purple-300',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

const priorityVariants: Record<string, string> = {
  critical: 'bg-red-50 text-red-700 dark:bg-red-500/12 dark:text-red-300',
  high: 'bg-orange-50 text-orange-700 dark:bg-orange-500/12 dark:text-orange-300',
  medium: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/12 dark:text-yellow-300',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  none: 'bg-transparent text-gray-500 border border-gray-200 dark:border-gray-700 dark:text-gray-400',
};

export const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  pending: 'To Do',
  'in-progress': 'In Progress',
  completed: 'Completed',
  blocked: 'Blocked',
  review: 'Review',
  cancelled: 'Cancelled',
};

export const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'None',
};

// Solid dots instead of emoji: emoji render at inconsistent sizes and colors
// across platforms and read as decoration rather than signal.
const priorityDots: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-yellow-400',
  low: 'bg-gray-400',
  none: 'bg-transparent border border-gray-300 dark:border-gray-600',
};

export function Badge({ variant = 'default', size = 'sm', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        statusVariants[status] || variants.default,
        className
      )}
    >
      {status === 'in-progress' && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
      )}
      {status === 'completed' && (
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true" fill="none">
          <path d="M2.5 6.5 5 9l4.5-5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  const label = PRIORITY_LABELS[priority] || priority;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        priorityVariants[priority] || variants.default,
        className
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', priorityDots[priority] || priorityDots.none)}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

/** Bare priority dot for dense rows where a full pill is too heavy. */
export function PriorityDot({ priority, className }: { priority: string; className?: string }) {
  return (
    <span
      className={cn('h-2 w-2 shrink-0 rounded-full', priorityDots[priority] || priorityDots.none, className)}
      title={`${PRIORITY_LABELS[priority] || priority} priority`}
    />
  );
}
