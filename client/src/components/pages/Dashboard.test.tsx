import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { apiMocks } = vi.hoisted(() => ({
  apiMocks: {
    getTasks: vi.fn(),
    getStats: vi.fn(),
    generateDigest: vi.fn(),
    getNotifications: vi.fn(),
    createTask: vi.fn(),
  },
}));

vi.mock('@/api/tasks', () => ({
  getTasks: apiMocks.getTasks,
  toTaskArray: (d: unknown) => (Array.isArray(d) ? d : []),
  getStats: apiMocks.getStats,
  aiAPI: { generateDigest: apiMocks.generateDigest },
  getNotifications: apiMocks.getNotifications,
  createTask: apiMocks.createTask,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', name: 'Test User' }, isAuthenticated: true }),
}));

vi.mock('@/components/widgets/CalendarWidget', () => ({ default: () => <div /> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import Dashboard from './Dashboard';

const due = new Date(Date.now() + 86400000);
due.setHours(17, 30, 0, 0);

const TASKS = [
  { _id: 't1', title: 'Timed task', status: 'pending', priority: 'high', dueDate: due.toISOString() },
  { _id: 't2', title: 'Plain task', status: 'pending', priority: 'low' },
];

function mockAll() {
  apiMocks.getTasks.mockClear();
  apiMocks.getStats.mockClear();
  apiMocks.generateDigest.mockClear();
  apiMocks.getNotifications.mockClear();
  apiMocks.createTask.mockClear();
  apiMocks.getTasks.mockResolvedValue({ data: TASKS });
  apiMocks.getStats.mockResolvedValue({ data: { total: 2, byStatus: [], overdue: 0, completedToday: 0 } });
  apiMocks.generateDigest.mockRejectedValue(new Error('no ai'));
  apiMocks.getNotifications.mockResolvedValue({ data: [] });
  apiMocks.createTask.mockResolvedValue({ data: { _id: 't3', title: 'Captured task', status: 'pending' } });
}

describe('Dashboard task rows', () => {
  it('shows edit/delete actions and the exact due time', async () => {
    mockAll();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onRefresh = vi.fn();
    render(<Dashboard tasks={TASKS} loading={false} onRefresh={onRefresh} onEditTask={onEdit} onDeleteTask={onDelete} onNewTask={() => {}} onNavigate={() => {}} />);

    // Tasks are owned by the shell: Dashboard must NOT fetch them itself.
    expect(apiMocks.getTasks).not.toHaveBeenCalled();

    const editBtns = await screen.findAllByRole('button', { name: 'Edit Timed task' });
    expect(editBtns.length).toBeGreaterThanOrEqual(2); // Up next + Coming up
    const editBtn = editBtns[0];
    expect(screen.getAllByRole('button', { name: 'Delete Timed task' }).length).toBeGreaterThanOrEqual(2);

    const expectedTime = due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const expectedDay = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    // Right-side due stamp carries the exact time in its accessible title...
    const stamped = screen.getAllByTitle(`Due ${expectedDay} · ${expectedTime}`);
    expect(stamped.length).toBeGreaterThanOrEqual(1);
    // ...and renders it inline next to the relative label (both lists).
    expect(screen.getAllByText(new RegExp(expectedTime.replace(/[A-Za-z]+/g, '.'))).length).toBeGreaterThanOrEqual(2);

    fireEvent.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ _id: 't1' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete Timed task' })[0]);
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ _id: 't1' }));
  });

  it('shows the stamp under Coming up deadlines', async () => {
    mockAll();
    render(<Dashboard tasks={TASKS} loading={false} onRefresh={() => {}} onEditTask={() => {}} onDeleteTask={() => {}} onNewTask={() => {}} onNavigate={() => {}} />);
    expect(apiMocks.getTasks).not.toHaveBeenCalled();
    const expectedDay = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    expect(await screen.findByText(new RegExp(expectedDay.replace(/[^A-Za-z0-9]/g, '.')))).toBeInTheDocument();
  });

  it('quick capture creates immediately and background-syncs', async () => {
    mockAll();
    const onRefresh = vi.fn();
    render(<Dashboard tasks={TASKS} loading={false} onRefresh={onRefresh} onEditTask={() => {}} onDeleteTask={() => {}} onNewTask={() => {}} onNavigate={() => {}} />);

    const input = await screen.findByLabelText('Quick capture');
    fireEvent.change(input, { target: { value: 'Captured task' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(apiMocks.createTask).toHaveBeenCalledWith({ title: 'Captured task', status: 'pending' });
    });
    // Optimistic prepend: visible before any parent refetch lands...
    expect(await screen.findByText('Captured task')).toBeInTheDocument();
    // ...then the shell is asked to background-sync its canonical list.
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
