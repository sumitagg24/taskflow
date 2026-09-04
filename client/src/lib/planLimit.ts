import { toast } from 'sonner';
import { asPlanLimitError } from '@/api/tasks';

/**
 * Turns the server's 402 `PLAN_LIMIT_REACHED` into an actionable prompt instead
 * of a generic failure toast: it names the ceiling that was hit and offers the
 * one thing that resolves it.
 *
 * @returns true when the error was a plan limit and has been reported, so the
 * caller can skip its own toast.
 */
export function notifyPlanLimit(error: unknown): boolean {
  const limit = asPlanLimitError(error);
  if (!limit) return false;

  toast.error(`You've hit your plan limit (${limit.used}/${limit.limit} active tasks)`, {
    description: limit.message,
    duration: 8000,
    action: {
      label: 'See plans',
      onClick: () => {
        window.dispatchEvent(new CustomEvent('navigate', { detail: { section: 'team' } }));
      },
    },
  });
  return true;
}

/**
 * `notifyPlanLimit` first, then the server's message, then a fallback — the
 * shape every create path wants.
 */
export function reportCreateError(error: any, fallback = 'Failed to create task') {
  if (notifyPlanLimit(error)) return;
  toast.error(error?.response?.data?.message || fallback);
}
