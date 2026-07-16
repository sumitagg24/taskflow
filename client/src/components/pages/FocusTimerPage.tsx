import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useFocusTimer } from '@/hooks/useFocusTimer';
import {
  Timer, Play, Pause, RotateCcw, Activity,
  TrendingUp, Calendar,
} from 'lucide-react';

export default function FocusTimerPage() {
  const {
    mode, isRunning, sessionsCompleted, focusMinutes, timeLeft,
    toggleTimer, resetTimer, switchMode, minutes, seconds, progress,
    sessionsBeforeLongBreak,
  } = useFocusTimer();

  const circumference = 2 * Math.PI * 80;
  const offset = circumference * (1 - progress);

  const totalFocusHours = Math.floor(focusMinutes / 60);
  const totalFocusMins = focusMinutes % 60;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 lg:p-6 max-w-2xl mx-auto"
    >
      <div className="flex items-center gap-3 mb-6">
        <Timer size={24} className="text-yellow-500" />
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Focus Timer</h2>
          <p className="text-sm text-gray-400">Stay productive with Pomodoro technique</p>
        </div>
      </div>

      {/* Timer Card */}
      <div className="card p-8 text-center">
        {/* Mode Switcher */}
        <div className="flex gap-1 mb-8 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 max-w-sm mx-auto">
          {(['work', 'break', 'longBreak'] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              disabled={isRunning}
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-medium transition-all',
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
        <div className="relative flex items-center justify-center mb-8 mx-auto" style={{ width: 220, height: 220 }}>
          <svg width="220" height="220" className="transform -rotate-90">
            <circle cx="110" cy="110" r="80" fill="none" stroke="currentColor" strokeWidth="8" className="text-gray-100 dark:text-gray-800" />
            <motion.circle
              cx="110" cy="110" r="80"
              fill="none" stroke="currentColor" strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className={cn('transition-all duration-1000 ease-linear', mode === 'work' ? 'text-yellow-400' : 'text-green-400')}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-5xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </span>
            <span className="text-sm text-gray-400 capitalize mt-1">
              {mode === 'work' ? 'Focus Time' : mode === 'break' ? 'Break' : 'Long Break'}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <button
            onClick={toggleTimer}
            className={cn(
              'flex items-center justify-center rounded-2xl p-4 transition-all active:scale-95',
              'w-16 h-16',
              isRunning
                ? 'bg-yellow-400 text-gray-900 hover:bg-yellow-500 shadow-lg shadow-yellow-500/30'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
            title={isRunning ? 'Pause' : 'Start'}
          >
            {isRunning ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button
            onClick={resetTimer}
            className="rounded-2xl p-4 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-95"
            title="Reset"
          >
            <RotateCcw size={20} />
          </button>
        </div>

        {timeLeft === 0 && !isRunning && (
          <div className="text-center">
            <span className="text-sm font-medium text-yellow-500 animate-pulse">
              {mode === 'work' ? 'Session complete! Great work! 🌟' : 'Break over! Ready to focus? 🎯'}
            </span>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={18} className="text-yellow-500" />
            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">Sessions</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{sessionsCompleted}</p>
          <p className="text-xs text-gray-400 mt-1">completed today</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={18} className="text-green-500" />
            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">Focus Time</h3>
          </div>
          <p className="text-3xl font-bold text-green-500">
            {totalFocusHours > 0 ? `${totalFocusHours}h ${totalFocusMins}m` : `${focusMinutes}m`}
          </p>
          <p className="text-xs text-gray-400 mt-1">tracked today</p>
        </div>
      </div>

      {/* Info card */}
      <div className="card p-5 mt-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={18} className="text-yellow-500" />
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">Today's Progress</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Sessions target</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">{sessionsCompleted} / {sessionsBeforeLongBreak}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div className="h-full rounded-full bg-yellow-400 transition-all duration-500" style={{ width: `${Math.min(Math.round((sessionsCompleted / sessionsBeforeLongBreak) * 100), 100)}%` }} />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Focus target</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">
              {focusMinutes < 120 ? `${focusMinutes}m / 120m` : `${totalFocusHours}h ${totalFocusMins}m / 2h`}
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div className="h-full rounded-full bg-green-400 transition-all duration-500" style={{ width: `${Math.min(Math.round((focusMinutes / 120) * 100), 100)}%` }} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
