import { HTMLAttributes, ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';

type CardVariant = 'default' | 'flat' | 'quiet' | 'glass';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  /** Adds a hairline lift on hover — only for cards that are themselves clickable. */
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children?: ReactNode;
}

const variantClasses: Record<CardVariant, string> = {
  default: 'card',
  flat: 'card card-flat',
  quiet: 'card card-quiet',
  glass: 'card card-glass',
};

const paddingClasses = {
  none: '',
  sm: 'p-3.5',
  md: 'p-5',
  lg: 'p-6 sm:p-7',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'default', interactive, padding = 'md', className, children, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        variantClasses[variant],
        paddingClasses[padding],
        interactive &&
          'cursor-pointer hover:border-gray-300 hover:bg-gray-50/60 dark:hover:border-gray-600 dark:hover:bg-gray-800/40',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

/** Card header row: title/eyebrow on the left, actions on the right. */
export function CardHeader({
  title,
  eyebrow,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  eyebrow?: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="caption-upper mb-1">{eyebrow}</p>}
        <h3 className="font-display truncate text-lg text-gray-900 dark:text-gray-100">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * Numeric stat tile. `delta` is rendered as a signed percentage where positive
 * is green — pass `invertDelta` for metrics where down is good (overdue count).
 */
export function StatCard({
  label,
  value,
  icon,
  delta,
  invertDelta,
  hint,
  className,
  onClick,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  delta?: number | null;
  invertDelta?: boolean;
  hint?: string;
  className?: string;
  onClick?: () => void;
}) {
  const good = delta == null ? null : invertDelta ? delta <= 0 : delta >= 0;

  return (
    <Card
      variant="default"
      padding="md"
      interactive={!!onClick}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={className}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="caption-upper">{label}</p>
        {icon && <span className="shrink-0 text-gray-400 dark:text-gray-500">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-3xl leading-none text-gray-900 dark:text-gray-50">
          {value}
        </span>
        {delta != null && (
          <span
            className={cn(
              'text-xs font-medium',
              good ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}
          >
            {delta > 0 ? '+' : ''}
            {delta}%
          </span>
        )}
      </div>
      {hint && <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </Card>
  );
}
