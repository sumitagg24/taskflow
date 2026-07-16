import { cn } from '@/lib/utils';

export interface BadgeProps {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'muted';
  size?: 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
}

const variants = {
  default: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  primary: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  warning: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  muted: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

const statusVariants: Record<string, string> = {
  backlog: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  pending: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'in-progress': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  blocked: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  review: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

const priorityVariants: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  low: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  none: 'bg-gray-50 text-gray-400 dark:bg-gray-800/50 dark:text-gray-500',
};

export function Badge({ variant = 'default', size = 'sm', children, className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      variants[variant],
      className
    )}>
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const labels: Record<string, string> = {
    backlog: 'Backlog',
    pending: 'To Do',
    'in-progress': 'In Progress',
    completed: 'Completed',
    blocked: 'Blocked',
    review: 'Review',
    cancelled: 'Cancelled',
  };

  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
      statusVariants[status] || variants.default,
      className
    )}>
      {status === 'in-progress' && <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {status === 'completed' && <span className="mr-1.5">✓</span>}
      {labels[status] || status}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  const labels: Record<string, string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    none: 'None',
  };

  const icons: Record<string, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '⚪',
    none: '',
  };

  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
      priorityVariants[priority] || variants.default,
      className
    )}>
      {icons[priority] && <span className="mr-1">{icons[priority]}</span>}
      {labels[priority] || priority}
    </span>
  );
}
