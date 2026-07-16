import { useTheme } from '@/context/ThemeContext';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggleTheme}
      className={cn(
        'relative flex h-9 w-[4.5rem] items-center gap-1 rounded-full px-1 transition-all duration-300',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50 focus-visible:ring-offset-2',
        isDark
          ? 'bg-gray-800'
          : 'bg-gray-100',
      )}
    >
      {/* Sliding background */}
      <span
        className={cn(
          'absolute top-0.5 h-8 w-[3.25rem] rounded-full transition-all duration-300',
          isDark
            ? 'left-0.5 bg-[#1a1a23] shadow-inner'
            : 'left-0.5 bg-white shadow-sm',
        )}
      />

      {/* Sun icon */}
      <span
        className={cn(
          'relative z-10 flex h-7 w-7 items-center justify-center rounded-full transition-all duration-300',
          !isDark
            ? 'text-amber-500'
            : 'text-gray-500',
        )}
      >
        <Sun size={14} strokeWidth={2.5} />
      </span>

      {/* Moon icon */}
      <span
        className={cn(
          'relative z-10 flex h-7 w-7 items-center justify-center rounded-full transition-all duration-300',
          isDark
            ? 'text-yellow-400'
            : 'text-gray-400',
        )}
      >
        <Moon size={14} strokeWidth={2.5} />
      </span>
    </button>
  );
}
