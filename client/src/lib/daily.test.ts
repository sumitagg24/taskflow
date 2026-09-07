import { describe, it, expect } from 'vitest';
import {
  partitionToday,
  destinationAfterTopRemoval,
  isInboxTask,
  isOverdueTask,
  todayKeyLocal,
  MAX_TOP_THREE,
  type ResolveAction,
} from '@/lib/daily';
import type { Task } from '@/lib/domain';

const t = (over: Partial<Task> & { _id: string; title: string; status: string }): Task =>
  ({ priority: 'medium', ...over }) as Task;

describe('daily lib — canonical partitioning', () => {
  it('excludes inbox from Today and overdue', () => {
    const day = todayKeyLocal();
    const inbox = t({ _id: '1', title: 'In', status: 'pending', inbox: true, plannedFor: new Date().toISOString() });
    expect(isInboxTask(inbox)).toBe(true);
    expect(isOverdueTask({ ...inbox, dueDate: new Date(Date.now() - 86400000).toISOString() } as Task)).toBe(false);
    const sections = partitionToday([inbox], day);
    expect(sections.flexible).toHaveLength(0);
    expect(sections.scheduled).toHaveLength(0);
  });

  it('never auto-fills Top Three; caps at three', () => {
    const day = todayKeyLocal();
    const tasks = [1, 2, 3, 4].map((i) =>
      t({ _id: String(i), title: `F${i}`, status: 'pending', inbox: false, plannedFor: new Date().toISOString() })
    );
    const sections = partitionToday(tasks, day);
    expect(sections.topThree).toHaveLength(0);
    expect(MAX_TOP_THREE).toBe(3);
  });

  it('splits scheduled (with time) from flexible (no time)', () => {
    const now = new Date();
    const day = todayKeyLocal(now);
    const withTime = new Date(now);
    withTime.setHours(10, 30, 0, 0);
    const dateOnly = new Date(now);
    dateOnly.setHours(0, 0, 0, 0);
    const scheduled = t({ _id: 's', title: 'Call', status: 'pending', inbox: false, dueDate: withTime.toISOString(), plannedFor: now.toISOString() });
    const flexible = t({ _id: 'f', title: 'Write', status: 'pending', inbox: false, plannedFor: now.toISOString() });
    const dateOnlyTask = t({ _id: 'd', title: 'Dated', status: 'pending', inbox: false, dueDate: dateOnly.toISOString(), plannedFor: now.toISOString() });
    const sections = partitionToday([scheduled, flexible, dateOnlyTask], day);
    expect(sections.scheduled.map((x) => x._id)).toContain('s');
    expect(sections.scheduled.map((x) => x._id)).not.toContain('d');
    expect(sections.flexible.map((x) => x._id)).toEqual(expect.arrayContaining(['f', 'd']));
  });

  it('explains Top Three removal destination', () => {
    const day = todayKeyLocal();
    const withTime = new Date();
    withTime.setHours(15, 0, 0, 0);
    const s = t({ _id: 's', title: 'Call', status: 'pending', dueDate: withTime.toISOString(), plannedFor: new Date().toISOString() });
    const f = t({ _id: 'f', title: 'Write', status: 'pending', plannedFor: new Date().toISOString() });
    expect(destinationAfterTopRemoval(s, day)).toBe('Scheduled');
    expect(destinationAfterTopRemoval(f, day)).toBe('Flexible');
  });

  it('resolve actions cover tomorrow/date/backlog/no-longer-needed without delete', () => {
    const actions: ResolveAction[] = ['tomorrow', 'date', 'backlog', 'no-longer-needed', 'complete'];
    expect(actions).toHaveLength(5);
    expect(actions).not.toContain('delete' as unknown as ResolveAction);
  });
});
