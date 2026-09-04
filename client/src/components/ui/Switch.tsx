import { ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** Renders label/description to the left and the control right-aligned. */
  layout?: 'row' | 'inline';
  className?: string;
  id?: string;
  'aria-label'?: string;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  size = 'md',
  layout = 'row',
  className,
  id: idProp,
  'aria-label': ariaLabel,
}: SwitchProps) {
  const autoId = useId();
  const id = idProp ?? `switch-${autoId}`;
  const descId = description ? `${id}-description` : undefined;

  const track = size === 'sm' ? 'h-4.5 w-8' : 'h-5.5 w-10';
  const knob = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5';
  const travel = size === 'sm' ? 'translate-x-3.5' : 'translate-x-4.5';

  const control = (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={!label ? ariaLabel : undefined}
      aria-describedby={descId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full border border-transparent p-0.5',
        'transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
        track,
        checked ? 'bg-yellow-400' : 'bg-gray-300 dark:bg-gray-700'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none inline-block rounded-full bg-white shadow-sm transition-transform duration-200',
          knob,
          checked ? travel : 'translate-x-0'
        )}
      />
    </button>
  );

  if (!label && !description) {
    return <span className={className}>{control}</span>;
  }

  if (layout === 'inline') {
    return (
      <span className={cn('inline-flex items-center gap-2.5', className)}>
        {control}
        <label htmlFor={id} className="cursor-pointer text-sm text-gray-700 dark:text-gray-300">
          {label}
        </label>
      </span>
    );
  }

  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {label && (
          <label
            htmlFor={id}
            className="block cursor-pointer text-sm font-medium text-gray-900 dark:text-gray-100"
          >
            {label}
          </label>
        )}
        {description && (
          <p id={descId} className="mt-0.5 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
            {description}
          </p>
        )}
      </div>
      <div className="pt-0.5">{control}</div>
    </div>
  );
}
