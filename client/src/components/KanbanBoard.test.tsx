import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import KanbanBoard from './KanbanBoard';

// Hoisted with the mock: `vi.mock` factories run before module-level consts.
// Pattern copied from TaskDetailDrawer.test.tsx:1-62.
const api = vi.hoisted(() => ({
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  createTask: vi.fn(),
  batchUpdate: vi.fn(),
  restoreTask: vi.fn(),
  updateOrder: vi.fn(),
}));

vi.mock('@/api/tasks', () => api);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from 'sonner';

const makeTasks = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    _id: `t${i}`,
    title: `Task ${i}`,
    status: 'pending',
    priority: 'medium',
  }));

beforeEach(() => {
  vi.clearAllMocks();
  api.updateTask.mockResolvedValue({ data: {} });
  api.updateOrder.mockResolvedValue({ data: {} });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('KanbanBoard windowing', () => {
  it('windows columns over 100 cards with Show more', () => {
    render(<KanbanBoard tasks={makeTasks(120)} onRefresh={() => {}} />);
    expect(screen.queryByText('Task 119')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /show more/i }));
    expect(screen.getByText('Task 119')).toBeInTheDocument();
  });
});

describe('KanbanBoard keyboard move', () => {
  it('arrow keys move a focused card between columns', async () => {
    render(<KanbanBoard tasks={makeTasks(2)} onRefresh={() => {}} />);
    const card = screen.getByLabelText(/Task 0.*move between columns/i);
    fireEvent.keyDown(card, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(api.updateTask).toHaveBeenCalledWith('t0', expect.objectContaining({ status: 'in-progress' }));
    });
  });

  it('failed move restores previous status without calling onRefresh', async () => {
    api.updateTask.mockRejectedValueOnce(new Error('network down'));
    const onRefresh = vi.fn();
    render(<KanbanBoard tasks={makeTasks(2)} onRefresh={onRefresh} />);
    const card = screen.getByLabelText(/Task 0.*move between columns/i);
    fireEvent.keyDown(card, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(api.updateTask).toHaveBeenCalledWith('t0', expect.objectContaining({ status: 'in-progress' }));
    });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to update task');
    });
    expect(onRefresh).not.toHaveBeenCalled();
    // Rolled back: Task 0 renders in the To Do column again. Scoped to To Do
    // because AnimatePresence exit ghosts may briefly linger in other columns.
    const todoColumn = screen.getByText('To Do').closest('div.flex.w-72') as HTMLElement;
    within(todoColumn).getByText('Task 0');
    // Moving right again still targets in-progress (had it stuck in
    // in-progress, it would target completed).
    fireEvent.keyDown(within(todoColumn).getByLabelText(/Task 0.*move between columns/i), { key: 'ArrowRight' });
    await waitFor(() => {
      expect(api.updateTask).toHaveBeenCalledTimes(2);
    });
    expect(api.updateTask.mock.calls[1]).toEqual(['t0', expect.objectContaining({ status: 'in-progress' })]);
  });

  it('successful move persists drop order via debounced updateOrder', async () => {
    vi.useFakeTimers();
    render(<KanbanBoard tasks={makeTasks(2)} onRefresh={() => {}} />);
    fireEvent.keyDown(screen.getByLabelText(/Task 0.*move between columns/i), { key: 'ArrowRight' });
    // updateTask resolves on the microtask queue; the debounce fires at 600ms.
    await vi.advanceTimersByTimeAsync(700);
    expect(api.updateTask).toHaveBeenCalledWith('t0', expect.objectContaining({ status: 'in-progress' }));
    expect(api.updateOrder).toHaveBeenCalledTimes(1);
    expect(api.updateOrder).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ _id: 't0', status: 'in-progress' })])
    );
    expect(toast.error).not.toHaveBeenCalled();
  });
});
