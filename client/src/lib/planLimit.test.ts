import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toast } from 'sonner';
import { notifyPlanLimit, reportCreateError } from './planLimit';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const planLimit = (overrides: Record<string, unknown> = {}) => ({
  response: {
    status: 402,
    data: {
      message: 'The Free plan tops out at 100 active tasks.',
      code: 'PLAN_LIMIT_REACHED',
      limit: 100,
      used: 100,
      resource: 'activeTasks',
      ...overrides,
    },
  },
});

describe('notifyPlanLimit', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  it('reports a 402 plan limit and says so', () => {
    expect(notifyPlanLimit(planLimit())).toBe(true);
    expect(toast.error).toHaveBeenCalledTimes(1);

    const [title, opts] = vi.mocked(toast.error).mock.calls[0] as [string, any];
    expect(title).toContain('100/100 active tasks');
    expect(opts.description).toBe('The Free plan tops out at 100 active tasks.');
    expect(opts.action.label).toBe('See plans');
  });

  it('routes the action to the plan surface', () => {
    const listener = vi.fn();
    window.addEventListener('navigate', listener as EventListener);

    notifyPlanLimit(planLimit());
    const [, opts] = vi.mocked(toast.error).mock.calls[0] as [string, any];
    opts.action.onClick();

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ section: 'team' });
    window.removeEventListener('navigate', listener as EventListener);
  });

  it('ignores a 402 without the plan-limit code', () => {
    expect(notifyPlanLimit(planLimit({ code: 'PAYMENT_REQUIRED' }))).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('ignores an unrelated failure', () => {
    expect(notifyPlanLimit({ response: { status: 500, data: {} } })).toBe(false);
    expect(notifyPlanLimit(new Error('network down'))).toBe(false);
    expect(notifyPlanLimit(undefined)).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('reportCreateError', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  it('prefers the plan-limit prompt', () => {
    reportCreateError(planLimit());
    const [title] = vi.mocked(toast.error).mock.calls[0] as [string, any];
    expect(title).toContain('plan limit');
  });

  it('falls back to the server message', () => {
    reportCreateError({ response: { status: 400, data: { message: 'Title is required' } } });
    expect(toast.error).toHaveBeenCalledWith('Title is required');
  });

  it('falls back to the caller default', () => {
    reportCreateError(new Error('offline'), 'Failed to apply template');
    expect(toast.error).toHaveBeenCalledWith('Failed to apply template');
  });
});
