import {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  forwardRef,
  useId,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, CheckCircle2, XCircle, ChevronDown } from 'lucide-react';

/** Shared label + helper/error scaffold so every field lines up on a grid. */
function Field({
  id,
  label,
  required,
  error,
  helperText,
  children,
  className,
}: {
  id?: string;
  label?: string;
  required?: boolean;
  error?: string;
  helperText?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-[13px] font-medium text-gray-700 dark:text-gray-300">
          {label}
          {required && (
            <span className="ml-0.5 text-red-500" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {(error || helperText) && (
        <p
          id={id ? `${id}-description` : undefined}
          className={cn(
            'text-xs',
            error ? 'animate-shake text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
          )}
        >
          {error || helperText}
        </p>
      )}
    </div>
  );
}

const fieldBase =
  'w-full bg-card border border-gray-200 text-sm text-gray-900 placeholder-gray-400 transition-[border-color,box-shadow] duration-200 outline-none ' +
  'focus:border-yellow-400 focus:ring-[3px] focus:ring-yellow-400/15 focus-visible:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 ' +
  'dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:disabled:bg-gray-800';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: ReactNode;
  error?: string;
  helperText?: ReactNode;
  rightElement?: ReactNode;
  required?: boolean;
  status?: string;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      icon,
      error,
      helperText,
      rightElement,
      required,
      className,
      wrapperClassName,
      status: _status,
      id: idProp,
      ...props
    },
    ref
  ) => {
    void _status;
    const autoId = useId();
    const id = idProp ?? `input-${autoId}`;

    return (
      <Field
        id={id}
        label={label}
        required={required}
        error={error}
        helperText={helperText}
        className={wrapperClassName}
      >
        <div className="group relative">
          {icon && (
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 transition-colors group-focus-within:text-yellow-500">
              {icon}
            </span>
          )}
          <input
            id={id}
            ref={ref}
            aria-invalid={error ? true : undefined}
            aria-describedby={error || helperText ? `${id}-description` : undefined}
            {...props}
            className={cn(
              fieldBase,
              'h-10 rounded-lg px-3.5',
              icon && 'pl-10',
              rightElement && 'pr-10',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500/15',
              className
            )}
          />
          {rightElement && (
            <span className="absolute inset-y-0 right-0 flex items-center pr-2.5">{rightElement}</span>
          )}
        </div>
      </Field>
    );
  }
);

Input.displayName = 'Input';

interface PasswordInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: ReactNode;
  required?: boolean;
}

export function PasswordInput({ label, error, helperText, required, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      label={label}
      error={error}
      helperText={helperText}
      required={required}
      type={visible ? 'text' : 'password'}
      rightElement={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      }
      {...props}
    />
  );
}

interface UsernameInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: ReactNode;
  status?: 'idle' | 'available' | 'taken' | 'typing';
  required?: boolean;
}

export const UsernameInput = forwardRef<HTMLInputElement, UsernameInputProps>(
  ({ label, error, helperText, status, required, className, ...props }, ref) => {
    let rightElement: ReactNode = null;
    if (status === 'available') rightElement = <CheckCircle2 size={16} className="text-green-600" />;
    else if (status === 'taken') rightElement = <XCircle size={16} className="text-red-500" />;
    else if (status === 'typing')
      rightElement = (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-yellow-500 dark:border-gray-600 dark:border-t-yellow-400" />
      );

    return (
      <Input
        ref={ref}
        label={label}
        error={error}
        helperText={helperText}
        rightElement={rightElement}
        required={required}
        className={cn(
          status === 'available' && 'border-green-500 focus:border-green-500 focus:ring-green-500/15',
          status === 'taken' && 'border-red-500 focus:border-red-500 focus:ring-red-500/15',
          className
        )}
        {...props}
      />
    );
  }
);

UsernameInput.displayName = 'UsernameInput';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: ReactNode;
  required?: boolean;
  wrapperClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, required, className, wrapperClassName, id: idProp, ...props }, ref) => {
    const autoId = useId();
    const id = idProp ?? `textarea-${autoId}`;

    return (
      <Field
        id={id}
        label={label}
        required={required}
        error={error}
        helperText={helperText}
        className={wrapperClassName}
      >
        <textarea
          id={id}
          ref={ref}
          rows={props.rows ?? 4}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || helperText ? `${id}-description` : undefined}
          {...props}
          className={cn(
            fieldBase,
            'resize-y rounded-lg px-3.5 py-2.5 leading-relaxed',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/15',
            className
          )}
        />
      </Field>
    );
  }
);

Textarea.displayName = 'Textarea';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: ReactNode;
  required?: boolean;
  options?: SelectOption[];
  placeholder?: string;
  wrapperClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      options,
      placeholder,
      className,
      wrapperClassName,
      id: idProp,
      children,
      ...props
    },
    ref
  ) => {
    const autoId = useId();
    const id = idProp ?? `select-${autoId}`;

    return (
      <Field
        id={id}
        label={label}
        required={required}
        error={error}
        helperText={helperText}
        className={wrapperClassName}
      >
        <div className="relative">
          <select
            id={id}
            ref={ref}
            aria-invalid={error ? true : undefined}
            aria-describedby={error || helperText ? `${id}-description` : undefined}
            {...props}
            className={cn(
              fieldBase,
              'h-10 cursor-pointer appearance-none rounded-lg pr-9 pl-3.5',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500/15',
              className
            )}
          >
            {placeholder && (
              <option value="" disabled={required}>
                {placeholder}
              </option>
            )}
            {options?.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
            {children}
          </select>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-gray-400"
          />
        </div>
      </Field>
    );
  }
);

Select.displayName = 'Select';
