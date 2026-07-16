import { motion } from 'framer-motion';
import { Timer, Play, Pause, RotateCcw } from 'lucide-react';
import { useFocusTimer } from '@/hooks/useFocusTimer';
import { cn } from '@/lib/utils';

export default function FocusTimer() {
  const {
    mode, isRunning, sessionsCompleted, focusMinutes, timeLeft,
    toggleTimer, resetTimer, switchMode, minutes, seconds, progress,
  } = useFocusTimer();

  const circumference = 2 * Math.PI * 54;
  const offset = circumference * (1 - progress);

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Timer size={18} className="text-yellow-500" />
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Focus Timer</h3>
      </div>

      {/* Mode Switcher */}
      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        {(['work', 'break', 'longBreak'] as const).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            disabled={isRunning}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-xs font-medium transition-all',
              mode === m
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
              isRunning && 'opacity-50 cursor-not-allowed'
            )}
          >
            {m === 'work' ? 'Focus' : m === 'break' ? 'Break' : 'Long Break'}
          </button>
        ))}
      </div>

      {/* Timer Display */}
      <div className="relative flex items-center justify-center mb-4">
        <svg width="130" height="130" className="transform -rotate-90">
          <circle
            cx="65" cy="65" r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-gray-100 dark:text-gray-800"
          />
          <motion.circle
            cx="65" cy="65" r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn(
              'transition-all duration-1000 ease-linear',
              mode === 'work' ? 'text-yellow-400' : 'text-green-400'
            )}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
          <span className="text-[10px] text-gray-400 capitalize">
            {mode === 'work' ? 'Focus' : mode === 'break' ? 'Break' : 'Long Break'}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={toggleTimer}
          className={cn(
            'flex items-center justify-center rounded-xl p-3 transition-all active:scale-95',
            isRunning
              ? 'bg-yellow-400 text-gray-900 hover:bg-yellow-500'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          )}
          title={isRunning ? 'Pause' : 'Start'}
        >
          {isRunning ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button
          onClick={resetTimer}
          className="rounded-xl p-3 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors active:scale-95"
          title="Reset"
        >
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Stats */}
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">
            Sessions: <strong className="text-gray-900 dark:text-gray-100">{sessionsCompleted}</strong>
          </span>
          <span className="text-gray-500">
            Today: <strong className="text-green-500">{focusMinutes}m</strong>
            {focusMinutes >= 60 && (
              <span className="text-gray-400 ml-1">
                ({Math.floor(focusMinutes / 60)}h {focusMinutes % 60}m)
              </span>
            )}
          </span>
        </div>
        {timeLeft === 0 && !isRunning && (
          <div className="text-center mt-2">
            <span className="text-xs font-medium text-yellow-500 animate-pulse">
              {mode === 'work' ? 'Session complete! Take a break.' : 'Break over! Time to focus.'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
