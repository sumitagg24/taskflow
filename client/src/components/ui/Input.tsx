import { InputHTMLAttributes, ReactNode, forwardRef, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: ReactNode;
  error?: string;
  helperText?: ReactNode;
  rightElement?: ReactNode;
  required?: boolean;
  status?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  // `status` is swallowed — it's only used by UsernameInput via className border colors.
  // We destructure it here to keep it from leaking onto the underlying <input>.
  ({ label, icon, error, helperText, rightElement, required, className, status: _status, ...props }, ref) => {
    void _status;
    const inputRef = useRef<HTMLInputElement>(null);
    const hasIcon = !!icon;
    const hasError = !!error;
    const hasRightElement = !!rightElement;
    const hasLabel = !!label;

    // Focus the input when parent focuses
    useEffect(() => {
      if (props.autoFocus && inputRef.current) {
        inputRef.current.focus();
      }
    }, [props.autoFocus]);

    return (
      <div className="space-y-1.5">
        {hasLabel && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}

        <div className="relative">
          {/* Icon positioned at the left inside the input - increased padding to pl-11 (44px) */}
          {hasIcon && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 transition-colors peer-focus:text-yellow-500">
              {icon}
            </div>
          )}

          <input
            ref={inputRef}
            {...props}
            className={cn(
              'peer w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed',
              hasIcon && 'pl-11',
              hasRightElement && 'pr-10',
              hasError && '!border-red-500 focus:border-red-500 focus:ring-red-500/20',
              className
            )}
          />

          {/* Right Element (Eye icon, status icon, etc.) */}
          {hasRightElement && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
              {rightElement}
            </div>
          )}
        </div>

        {/* Helper/Validation Text */}
        <div className="min-h-[18px]">
          {error ? (
            <p className="text-xs text-red-500 animate-shake">{error}</p>
          ) : (
            helperText && (
              <p className="text-xs text-gray-500 dark:text-gray-400 animate-fadeIn">{helperText}</p>
            )
          )}
        </div>
      </div>
    );
  }
);

Input.displayName = 'Input';

// Specialized Input for Password fields with toggle
interface PasswordInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export function PasswordInput({ label, error, helperText, required, className, ...props }: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Input
      ref={inputRef}
      label={label}
      error={error}
      helperText={helperText}
      required={required}
      type={showPassword ? 'text' : 'password'}
      rightElement={
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-500/30"
          tabIndex={-1}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? (
            <EyeOff size={16} />
          ) : (
            <Eye size={16} />
          )}
        </button>
      }
      {...props}
    />
  );
}

// Specialized Input for Username with status
interface UsernameInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  status?: 'idle' | 'available' | 'taken' | 'typing';
  required?: boolean;
}

export function UsernameInput({ label, error, helperText, status, required, className, ...props }: UsernameInputProps) {
  let rightElement: ReactNode = null;

  if (status === 'available') {
    rightElement = <CheckCircle2 size={16} className="text-green-500" />;
  } else if (status === 'taken') {
    rightElement = <XCircle size={16} className="text-red-500" />;
  } else if (status === 'typing') {
    rightElement = (
      <div className="w-4 h-4 border-2 border-gray-300 border-t-yellow-500 rounded-full animate-spin" />
    );
  }

  return (
    <Input
      label={label}
      error={error}
      helperText={helperText}
      status={status}
      rightElement={rightElement}
      required={required}
      className={cn(
        status === 'available' && '!border-green-500 focus:border-green-500 focus:ring-green-500/20',
        status === 'taken' && '!border-red-500 focus:border-red-500 focus:ring-red-500/20',
        className
      )}
      {...props}
    />
  );
}
