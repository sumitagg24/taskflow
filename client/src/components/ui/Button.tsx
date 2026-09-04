import { ButtonHTMLAttributes, ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'accentSoft';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  children?: ReactNode;
}

// Clay fill carries an ink label rather than white: #141413 on #cc785c is
// 5.5:1, where white would be 3.4:1 and fail AA for a 14px label. Hover only
// deepens the fill enough to stay above 4.5:1 with that same ink label; the
// pressed state is the one place the label flips to white (5.1:1 on #a9583e).
const variants = {
  primary:
    'bg-yellow-400 text-gray-950 hover:bg-clay-hover active:bg-clay-active active:text-white',
  secondary:
    'bg-gray-100 text-gray-900 border border-transparent hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700',
  accentSoft:
    'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-500/12 dark:text-yellow-300 dark:hover:bg-yellow-500/20',
  ghost:
    'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
  danger: 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700',
  outline:
    'border border-gray-200 bg-transparent text-gray-700 hover:bg-gray-100 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800',
};

const sizes = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-10 px-5 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-base gap-2.5 rounded-lg',
  icon: 'h-10 w-10 text-sm rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    iconRight,
    fullWidth,
    children,
    className,
    disabled,
    type = 'button',
    ...props
  },
  ref
) {
  const spinnerSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;

  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium tracking-[-0.005em]',
        'transition-colors duration-200 disabled:opacity-45 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2 size={spinnerSize} className="animate-spin" aria-hidden="true" />
      ) : icon ? (
        <span className="shrink-0" aria-hidden="true">{icon}</span>
      ) : null}
      {children && <span className="truncate">{children}</span>}
      {!loading && iconRight ? (
        <span className="shrink-0" aria-hidden="true">{iconRight}</span>
      ) : null}
    </button>
  );
});
