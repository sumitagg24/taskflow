import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import InboxPage from '@/components/daily/InboxPage';
import { dailyAPI } from '@/api/tasks';

vi.mock('@/api/tasks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/tasks')>();
  return {
    ...actual,
    dailyAPI: {
      inbox: vi.fn(),
      triage: vi.fn().mockResolvedValue({ data: { updated: [], count: 0 } }),
    },
    updateTask: vi.fn().mockResolvedValue({}),
    deleteTask: vi.fn().mockResolvedValue({}),
    restoreTask: vi.fn().mockResolvedValue({ data: { _id: 'x' } }),
  };
});

describe('InboxPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires only a title conceptually: lists untriaged with Inbox badge, distinct from overdue', async () => {
    (dailyAPI.inbox as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        tasks: [{ _id: '1', title: 'Quick thought', status: 'backlog', priority: 'medium', inbox: true }],
        count: 1,
        overdueCount: 2,
      },
    });
    render(<InboxPage />);
    await waitFor(() => expect(screen.getByText('Quick thought')).toBeInTheDocument());
    expect(screen.getByText(/Inbox · untriaged/i)).toBeInTheDocument();
    expect(screen.getByText(/2 overdue.*outside the Inbox/i)).toBeInTheDocument();
  });

  it('shows empty state when clear', async () => {
    (dailyAPI.inbox as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { tasks: [], count: 0, overdueCount: 0 },
    });
    render(<InboxPage />);
    await waitFor(() => expect(screen.getByText(/Inbox is clear/i)).toBeInTheDocument());
  });

  it('bulk bar appears on selection with all five triage actions', async () => {
    (dailyAPI.inbox as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        tasks: [
          { _id: '1', title: 'A', status: 'backlog', priority: 'medium', inbox: true },
          { _id: '2', title: 'B', status: 'backlog', priority: 'medium', inbox: true },
        ],
        count: 2,
        overdueCount: 0,
      },
    });
    render(<InboxPage />);
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Select “A”/i }));
    expect(await screen.findByRole('toolbar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Move to Today/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Assign date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Assign project/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Set priority/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
  });
});
