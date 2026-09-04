import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import KanbanBoard from './KanbanBoard';

// Hoisted with the mock: `vi.mock` factories run before module-level consts.
// Pattern copied from TaskDetailDrawer.test.tsx:1-62.
const api = vi.hoisted(() => ({
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  createTask: vi.fn(),
  batchUpdate: vi.fn(),
  restoreTask: vi.fn(),
}));

vi.mock('@/api/tasks', () => api);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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
});
