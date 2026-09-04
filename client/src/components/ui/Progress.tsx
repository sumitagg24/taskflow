import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ProgressTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

const toneFill: Record<ProgressTone, string> = {
  accent: 'bg-yellow-400',
  success: 'bg-green-500',
  warning: 'bg-amber-400',
  danger: 'bg-red-500',
  neutral: 'bg-gray-400 dark:bg-gray-500',
};

export function Progress({
  value,
  max = 100,
  tone = 'accent',
  size = 'md',
  label,
  ariaLabel,
  showValue,
  className,
}: {
  value: number;
  max?: number;
  tone?: ProgressTone;
  size?: 'xs' | 'sm' | 'md';
  label?: ReactNode;
  /** Accessible name when the bar is labelled by nearby markup rather than `label`. */
  ariaLabel?: string;
  showValue?: boolean;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 100;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  const height = size === 'xs' ? 'h-1' : size === 'sm' ? 'h-1.5' : 'h-2';

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          {label && <span className="text-[13px] text-gray-600 dark:text-gray-400">{label}</span>}
          {showValue && (
            <span className="text-xs font-medium tabular-nums text-gray-500 dark:text-gray-400">
              {Math.round(pct)}%
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        className={cn('w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800', height)}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', toneFill[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Compact ring for scores and streak dials. Stroke is drawn with a dash offset
 * so it animates via CSS transition rather than JS.
 */
export function ProgressRing({
  value,
  max = 100,
  size = 72,
  thickness = 6,
  tone = 'accent',
  children,
  className,
  label,
}: {
  value: number;
  max?: number;
  size?: number;
  thickness?: number;
  tone?: ProgressTone;
  children?: ReactNode;
  className?: string;
  label?: string;
}) {
  const safeMax = max > 0 ? max : 100;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  const stroke: Record<ProgressTone, string> = {
    accent: 'stroke-yellow-400',
    success: 'stroke-green-500',
    warning: 'stroke-amber-400',
    danger: 'stroke-red-500',
    neutral: 'stroke-gray-400',
  };

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${Math.round(pct)}%`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className="stroke-gray-200 dark:stroke-gray-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn('transition-[stroke-dashoffset] duration-700', stroke[tone])}
          style={{ transitionTimingFunction: 'cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children ?? (
          <span className="font-display text-lg leading-none text-gray-900 dark:text-gray-50">
            {Math.round(pct)}
          </span>
        )}
      </div>
    </div>
  );
}

/** Keyboard key chip. Accepts "mod" and maps it to ⌘ / Ctrl per platform. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('kbd', className)}>{children}</kbd>;
}

export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');

export function KbdShortcut({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {keys.map((k, i) => (
        <Kbd key={`${k}-${i}`}>{k === 'mod' ? (IS_MAC ? '⌘' : 'Ctrl') : k}</Kbd>
      ))}
    </span>
  );
}
