import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TodayPage from '@/components/daily/TodayPage';
import { dailyAPI } from '@/api/tasks';

vi.mock('@/api/tasks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/tasks')>();
  return {
    ...actual,
    dailyAPI: {
      today: vi.fn(),
      reorder: vi.fn().mockResolvedValue({}),
      setTopThree: vi.fn(),
      resolve: vi.fn(),
    },
    updateTask: vi.fn().mockResolvedValue({}),
  };
});

vi.mock('@/components/daily/EndOfDayDialog', () => ({
  default: () => null,
}));

const dayKey = new Date().toISOString().slice(0, 10);
const mk = (id: string, title: string, extra = {}) => ({
  _id: id,
  title,
  status: 'pending',
  priority: 'medium',
  inbox: false,
  ...extra,
});

describe('TodayPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders three sections with counts and an empty Top Three (never auto-filled)', async () => {
    (dailyAPI.today as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        date: dayKey,
        counts: { topThree: 0, scheduled: 1, flexible: 1, overdue: 0, inbox: 0, completedToday: 0 },
        topThree: [],
        scheduled: [mk('s1', 'Call', { dueDate: new Date(new Date().setHours(10, 30, 0, 0)).toISOString() })],
        flexible: [mk('f1', 'Write')],
        overdue: [],
        completedToday: [],
      },
    });
    render(<TodayPage />);
    await waitFor(() => expect(screen.getAllByText(/Top Three/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/No Top Three yet/i)).toBeInTheDocument();
    expect(screen.getByText('Call')).toBeInTheDocument();
    expect(screen.getByText('Write')).toBeInTheDocument();
  });

  it('shows loading then error with retry', async () => {
    (dailyAPI.today as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('down'));
    render(<TodayPage />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('distinguishes overdue separately', async () => {
    (dailyAPI.today as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        date: dayKey,
        counts: { topThree: 0, scheduled: 0, flexible: 0, overdue: 2, inbox: 0, completedToday: 0 },
        topThree: [],
        scheduled: [],
        flexible: [],
        overdue: [mk('o1', 'Late bill'), mk('o2', 'Late report')],
        completedToday: [],
      },
    });
    render(<TodayPage />);
    await waitFor(() => expect(screen.getAllByText(/2 overdue/i).length).toBeGreaterThan(0));
  });
});
