import type { Task } from '@/lib/domain';

/**
 * Phase 6 daily-loop helpers — pure functions over the canonical Task model.
 * Inbox, Today sections and weekly review are all DERIVED (no duplicated
 * data); the server persists only inbox/plannedFor/isTopThree/todayOrder.
 */

export const MAX_TOP_THREE = 3;

/** Window event that opens global quick capture from any nested route. */
export const QUICK_CAPTURE_EVENT = 'taskflow:quick-capture';

export function requestQuickCapture() {
  window.dispatchEvent(new CustomEvent(QUICK_CAPTURE_EVENT));
}

export const OPEN_STATUSES = new Set(['backlog', 'pending', 'in-progress', 'blocked', 'review']);

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKeyLocal(date = new Date()): string {
  return toDateKey(date);
}

export function tomorrowKeyLocal(date = new Date()): string {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return toDateKey(d);
}

export function addDaysKey(key: string, delta: number): string {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return toDateKey(d);
}

export function isInboxTask(t: Task): boolean {
  return t.inbox === true;
}

export function isOverdueTask(t: Task, now = new Date()): boolean {
  if (isInboxTask(t)) return false;
  if (!t.dueDate) return false;
  if (!OPEN_STATUSES.has(t.status)) return false;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(t.dueDate).getTime() < startOfToday.getTime();
}

export function hasClockTime(iso?: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0;
}

export function isDueOnDay(t: Task, dayKey: string): boolean {
  if (!t.dueDate) return false;
  return toDateKey(new Date(t.dueDate)) === dayKey;
}

export function isPlannedForDay(t: Task, dayKey: string): boolean {
  if (!t.plannedFor) return false;
  return toDateKey(new Date(t.plannedFor)) === dayKey;
}

/** Today membership: planned for the day OR due that day (inbox excluded). */
export function isTodayTask(t: Task, dayKey: string): boolean {
  if (isInboxTask(t)) return false;
  if (!OPEN_STATUSES.has(t.status)) return false;
  return isPlannedForDay(t, dayKey) || isDueOnDay(t, dayKey);
}

export interface TodaySections {
  topThree: Task[];
  scheduled: Task[];
  flexible: Task[];
  overdue: Task[];
}

const byTopOrder = (a: Task, b: Task) => (a.topThreeOrder ?? 0) - (b.topThreeOrder ?? 0);
const byTodayOrder = (a: Task, b: Task) => {
  const d = (a.todayOrder ?? 0) - (b.todayOrder ?? 0);
  if (d !== 0) return d;
  return new Date(a.createdAt as string || 0).getTime() - new Date(b.createdAt as string || 0).getTime();
};

/**
 * Client-side mirror of GET /api/daily/today partitioning (for offline /
 * optimistic rendering). Server remains authoritative; this never writes.
 */
export function partitionToday(tasks: Task[], dayKey: string, now = new Date()): TodaySections {
  const openToday = tasks.filter((t) => isTodayTask(t, dayKey));
  const topThree = openToday
    .filter((t) => t.isTopThree)
    .sort(byTopOrder)
    .slice(0, MAX_TOP_THREE);
  const topIds = new Set(topThree.map((t) => t._id));
  const scheduled = openToday
    .filter((t) => !topIds.has(t._id) && t.dueDate && isDueOnDay(t, dayKey) && hasClockTime(t.dueDate))
    .sort((a, b) => {
      const d = new Date(a.dueDate as string).getTime() - new Date(b.dueDate as string).getTime();
      return d !== 0 ? d : byTodayOrder(a, b);
    });
  const scheduledIds = new Set(scheduled.map((t) => t._id));
  const flexible = openToday
    .filter((t) => !topIds.has(t._id) && !scheduledIds.has(t._id))
    .sort(byTodayOrder);
  const overdue = tasks.filter((t) => isOverdueTask(t, now));
  return { topThree, scheduled, flexible, overdue };
}

/** Where a task lands when removed from the Top Three (for the explainer). */
export function destinationAfterTopRemoval(t: Task, dayKey: string): 'Scheduled' | 'Flexible' {
  if (t.dueDate && isDueOnDay(t, dayKey) && hasClockTime(t.dueDate)) return 'Scheduled';
  return 'Flexible';
}

export type ResolveAction = 'tomorrow' | 'date' | 'backlog' | 'no-longer-needed' | 'complete';

export const RESOLVE_LABELS: Record<ResolveAction, string> = {
  tomorrow: 'Move to tomorrow',
  date: 'Choose another date',
  backlog: 'Return to backlog',
  'no-longer-needed': 'No longer needed',
  complete: 'Mark complete',
};

export function formatDayKey(key: string): string {
  const d = new Date(`${key}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
