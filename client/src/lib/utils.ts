import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Briefcase, User, BookOpen, Dumbbell, ShoppingBag, Wallet, GraduationCap, Star,
  type LucideIcon,
} from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface CategoryConfigItem {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  hoverColor: string;
}

export const CATEGORY_CONFIG: CategoryConfigItem[] = [
  { id: 'work', label: 'Work', icon: Briefcase, color: 'bg-blue-500', hoverColor: 'hover:bg-blue-50 dark:hover:bg-blue-500/10' },
  { id: 'personal', label: 'Personal', icon: User, color: 'bg-green-500', hoverColor: 'hover:bg-green-50 dark:hover:bg-green-500/10' },
  { id: 'college', label: 'College', icon: GraduationCap, color: 'bg-purple-500', hoverColor: 'hover:bg-purple-50 dark:hover:bg-purple-500/10' },
  { id: 'projects', label: 'Projects', icon: BookOpen, color: 'bg-yellow-500', hoverColor: 'hover:bg-yellow-50 dark:hover:bg-yellow-500/10' },
  { id: 'fitness', label: 'Fitness', icon: Dumbbell, color: 'bg-orange-500', hoverColor: 'hover:bg-orange-50 dark:hover:bg-orange-500/10' },
  { id: 'shopping', label: 'Shopping', icon: ShoppingBag, color: 'bg-pink-500', hoverColor: 'hover:bg-pink-50 dark:hover:bg-pink-500/10' },
  { id: 'finance', label: 'Finance', icon: Wallet, color: 'bg-emerald-500', hoverColor: 'hover:bg-emerald-50 dark:hover:bg-emerald-500/10' },
  { id: 'learning', label: 'Learning', icon: Star, color: 'bg-indigo-500', hoverColor: 'hover:bg-indigo-50 dark:hover:bg-indigo-500/10' },
];

export const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-400',
  none: 'bg-gray-200 dark:bg-gray-600',
};

export type PomodoroSettings = {
  workDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  sessionsBeforeLongBreak: number;
};

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  workDuration: 25,
  breakDuration: 5,
  longBreakDuration: 15,
  sessionsBeforeLongBreak: 4,
};

export const resolvePomodoroSettings = (
  settings?: Partial<PomodoroSettings> | null
): PomodoroSettings => ({
  ...DEFAULT_POMODORO_SETTINGS,
  ...(settings || {}),
});
