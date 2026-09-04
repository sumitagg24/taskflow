import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import TaskDetailDrawer from './TaskDetailDrawer';

// Hoisted with the mock: `vi.mock` factories run before module-level consts.
const api = vi.hoisted(() => ({
  getTask: vi.fn(),
  addSubtask: vi.fn(),
  updateSubtask: vi.fn(),
  deleteSubtask: vi.fn(),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
  startTimer: vi.fn(),
  stopTimer: vi.fn(),
  toggleFavorite: vi.fn(),
  getActivityLog: vi.fn(),
}));

vi.mock('@/api/tasks', () => api);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const TASK_ID = '651111111111111111111111';

const task = (overrides: Record<string, any> = {}) => ({
  _id: TASK_ID,
  title: 'Ship the detail drawer',
  description: 'Read-only surface for one task.',
  status: 'in-progress',
  priority: 'high',
  dueDate: '2026-09-30T00:00:00.000Z',
  createdAt: '2026-09-01T00:00:00.000Z',
  category: 'Work',
  tags: ['ui', 'mvp'],
  subtasks: [],
  comments: [],
  dependencies: [],
  timeSessions: [],
  estimatedTime: 0,
  timeSpent: 0,
  isFavorite: false,
  isRecurring: false,
  ...overrides,
});

const subtask = (id: string, title: string, completed = false) => ({
  _id: id,
  title,
  completed,
});

const props = {
  taskId: TASK_ID,
  onClose: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onChanged: vi.fn(),
};

/** The drawer only paints its sections once the populated task has landed. */
const loaded = () => screen.findByRole('heading', { name: 'Ship the detail drawer' });

const steps = () => within(screen.getByRole('heading', { name: /Steps/ }).closest('section')!);
const timeCard = () => within(screen.getByRole('heading', { name: 'Time' }).closest('section')!);

beforeEach(() => {
  vi.clearAllMocks();
  api.getTask.mockResolvedValue({ data: task() });
  api.getActivityLog.mockResolvedValue({ data: [] });
});

describe('TaskDetailDrawer — loading', () => {
  it('renders nothing until a task id is given', () => {
    render(<TaskDetailDrawer {...props} taskId={null} />);

    expect(api.getTask).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reads the populated task and its own activity feed', async () => {
    render(<TaskDetailDrawer {...props} />);
    await loaded();

    expect(api.getTask).toHaveBeenCalledWith(TASK_ID);
    // The history panel must be task-scoped, not the account-wide feed.
    expect(api.getActivityLog).toHaveBeenCalledWith({ taskId: TASK_ID, limit: 25 });
  });

  it('shows the meta a reader wants before the detail', async () => {
    render(<TaskDetailDrawer {...props} />);
    await loaded();

    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Read-only surface for one task.')).toBeInTheDocument();
    expect(screen.getByText('ui')).toBeInTheDocument();
  });

  it('closes and reports when the task has gone', async () => {
    const { toast } = await import('sonner');
    api.getTask.mockRejectedValue(new Error('404'));
    const onClose = vi.fn();
    render(<TaskDetailDrawer {...props} onClose={onClose} />);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Task no longer available'));
    expect(onClose).toHaveBeenCalled();
  });

  it('still renders when only the activity read fails', async () => {
    api.getActivityLog.mockRejectedValue(new Error('offline'));
    render(<TaskDetailDrawer {...props} />);
    await loaded();

    expect(screen.queryByRole('heading', { name: 'History' })).not.toBeInTheDocument();
  });
});

describe('TaskDetailDrawer — steps', () => {
  const withSteps = () =>
    task({ subtasks: [subtask('s1', 'Draft the markup'), subtask('s2', 'Wire the API', true)] });

  it('meters completion against the number of steps', async () => {
    api.getTask.mockResolvedValue({ data: withSteps() });
    render(<TaskDetailDrawer {...props} />);
    await loaded();

    expect(screen.getByText('1 of 2 done')).toBeInTheDocument();
    // Progress publishes a percentage against 0–100; the real counts live in
    // the accessible name.
    expect(
      screen.getByRole('progressbar', { name: 'Steps: 1 of 2 complete' })
    ).toHaveAttribute('aria-valuenow', '50');
  });

  it('toggles a step to the opposite of its current state', async () => {
    api.getTask.mockResolvedValue({ data: withSteps() });
    api.updateSubtask.mockResolvedValue({ data: {} });
    render(<TaskDetailDrawer {...props} />);
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Mark “Draft the markup” done' }));

    await waitFor(() =>
      expect(api.updateSubtask).toHaveBeenCalledWith(TASK_ID, 's1', { completed: true })
    );
    // A completed step offers the inverse action rather than a dead checkbox.
    expect(
      screen.getByRole('button', { name: 'Mark “Wire the API” not done' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('adds a trimmed step and clears the field', async () => {
    api.addSubtask.mockResolvedValue({ data: {} });
    api.getTask
      .mockResolvedValueOnce({ data: task() })
      .mockResolvedValue({ data: task({ subtasks: [subtask('s9', 'Write the tests')] }) });

    render(<TaskDetailDrawer {...props} />);
    await loaded();

    fireEvent.change(screen.getByLabelText('New step'), {
      target: { value: '  Write the tests  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));

    await waitFor(() => expect(api.addSubtask).toHaveBeenCalledWith(TASK_ID, 'Write the tests'));
    expect(await screen.findByText('Write the tests')).toBeInTheDocument();
    expect(screen.getByLabelText('New step')).toHaveValue('');
  });

  it('removes a step', async () => {
    api.getTask
      .mockResolvedValueOnce({ data: withSteps() })
      .mockResolvedValue({ data: task({ subtasks: [subtask('s2', 'Wire the API', true)] }) });
    api.deleteSubtask.mockResolvedValue({ data: {} });

    render(<TaskDetailDrawer {...props} />);
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Remove step “Draft the markup”' }));

    await waitFor(() => expect(api.deleteSubtask).toHaveBeenCalledWith(TASK_ID, 's1'));
    await waitFor(() => expect(steps().queryByText('Draft the markup')).not.toBeInTheDocument());
  });

  it('refuses to post an empty step', async () => {
    render(<TaskDetailDrawer {...props} />);
    await loaded();

    fireEvent.change(screen.getByLabelText('New step'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Add step' })).toBeDisabled();
  });
});

describe('TaskDetailDrawer — time', () => {
  it('shows spent against the estimate', async () => {
    api.getTask.mockResolvedValue({ data: task({ timeSpent: 45, estimatedTime: 120 }) });
    render(<TaskDetailDrawer {...props} />);
    await loaded();

    expect(timeCard().getByText('45m')).toBeInTheDocument();
    expect(timeCard().getByText('2h')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Time used: 45m of 2h' })
    ).toBeInTheDocument();
  });

  it('flags an overrun instead of pinning the meter at full', async () => {
    api.getTask.mockResolvedValue({ data: task({ timeSpent: 150, estimatedTime: 120 }) });
    render(<TaskDetailDrawer {...props} />);
    await loaded();

    expect(screen.getByText('30m over estimate')).toBeInTheDocument();
  });

  it('leaves out the meter when nobody estimated the task', async () => {
    api.getTask.mockResolvedValue({ data: task({ timeSpent: 20, estimatedTime: 0 }) });
    render(<TaskDetailDrawer {...props} />);
    await loaded();

    expect(timeCard().getByText('—')).toBeInTheDocument();
    expect(timeCard().queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('starts the timer when no session is open', async () => {
    api.startTimer.mockResolvedValue({ data: {} });
    render(<TaskDetailDrawer {...props} />);
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: /Start timer/ }));

    await waitFor(() => expect(api.startTimer).toHaveBeenCalledWith(TASK_ID));
    expect(api.stopTimer).not.toHaveBeenCalled();
  });

  it('offers to stop a session that is still running', async () => {
    api.getTask.mockResolvedValue({
      data: task({ timeSessions: [{ _id: 'x1', start: '2026-09-02T10:00:00.000Z', end: null }] }),
    });
    api.stopTimer.mockResolvedValue({ data: {} });
    render(<TaskDetailDrawer {...props} />);
    await loaded();

    expect(timeCard().getByText('Running')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Stop timer/ }));

    await waitFor(() => expect(api.stopTimer).toHaveBeenCalledWith(TASK_ID));
  });
});

describe('TaskDetailDrawer — dependencies', () => {
  const linked = () =>
    task({
      dependencies: [
        {
          _id: 'd1',
          type: 'blocked-by',
          taskId: { _id: 't2', title: 'Design review', status: 'pending' },
        },
        {
          _id: 'd2',
          type: 'blocks',
          taskId: { _id: 't3', title: 'Launch post', status: 'backlog' },
        },
      ],
    });

  it('separates what blocks this task from what it blocks', async () => {
    api.getTask.mockResolvedValue({ data: linked() });
    render(<TaskDetailDrawer {...props} />);
    await loaded();

    expect(screen.getByText('Blocked by')).toBeInTheDocument();
    expect(screen.getByText('Design review')).toBeInTheDocument();
    expect(screen.getByText('Blocks')).toBeInTheDocument();
    expect(screen.getByText('Launch post')).toBeInTheDocument();
    // Each chip carries the linked task's own status, not this task's.
    expect(screen.getByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('Backlog')).toBeInTheDocument();
  });

  it('skips a link whose task has since been deleted', async () => {
    api.getTask.mockResolvedValue({
      data: task({ dependencies: [{ _id: 'd3', type: 'blocked-by', taskId: null }] }),
    });
    render(<TaskDetailDrawer {...props} />);
    await loaded();

    expect(screen.queryByRole('heading', { name: 'Dependencies' })).not.toBeInTheDocument();
  });
});

describe('TaskDetailDrawer — comments', () => {
  const comment = (id: string, text: string, userId: any) => ({
    _id: id,
    text,
    userId,
    createdAt: new Date().toISOString(),
  });

  it('names the author from the populated user', async () => {
    api.getTask.mockResolvedValue({
      data: task({
        comments: [comment('c1', 'Looks good to me', { _id: 'u1', name: 'Priya', avatar: null })],
      }),
    });
    render(<TaskDetailDrawer {...props} />);
    await loaded();

    expect(screen.getByText('Priya')).toBeInTheDocument();
    expect(screen.getByText('Looks good to me')).toBeInTheDocument();
  });

  it('falls back gracefully when the author came back unpopulated', async () => {
    api.getTask.mockResolvedValue({
      data: task({ comments: [comment('c2', 'Noted', '651222222222222222222222')] }),
    });
    render(<TaskDetailDrawer {...props} />);
    await loaded();

    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Noted')).toBeInTheDocument();
  });

  it('posts a comment and clears the field', async () => {
    api.addComment.mockResolvedValue({ data: {} });
    api.getTask
      .mockResolvedValueOnce({ data: task() })
      .mockResolvedValue({
        data: task({ comments: [comment('c3', 'Shipping today', { _id: 'u1', name: 'Sam' })] }),
      });

    render(<TaskDetailDrawer {...props} />);
    await loaded();

    fireEvent.change(screen.getByLabelText('New comment'), {
      target: { value: 'Shipping today' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }));

    await waitFor(() => expect(api.addComment).toHaveBeenCalledWith(TASK_ID, 'Shipping today'));
    expect(await screen.findByText('Shipping today')).toBeInTheDocument();
    expect(screen.getByLabelText('New comment')).toHaveValue('');
  });

  it('deletes a comment', async () => {
    api.getTask
      .mockResolvedValueOnce({
        data: task({ comments: [comment('c4', 'Never mind', { _id: 'u1', name: 'Sam' })] }),
      })
      .mockResolvedValue({ data: task() });
    api.deleteComment.mockResolvedValue({ data: {} });

    render(<TaskDetailDrawer {...props} />);
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }));

    await waitFor(() => expect(api.deleteComment).toHaveBeenCalledWith(TASK_ID, 'c4'));
    await waitFor(() => expect(screen.queryByText('Never mind')).not.toBeInTheDocument());
  });

  it('surfaces the server message when a comment is refused', async () => {
    const { toast } = await import('sonner');
    api.addComment.mockRejectedValue({ response: { data: { message: 'Comment too long' } } });
    render(<TaskDetailDrawer {...props} />);
    await loaded();

    fireEvent.change(screen.getByLabelText('New comment'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Comment too long'));
  });
});

describe('TaskDetailDrawer — history and footer', () => {
  it('lists this task’s activity', async () => {
    api.getActivityLog.mockResolvedValue({
      data: [
        {
          _id: 'a1',
          action: 'task_status_changed',
          details: 'moved to In Progress',
          createdAt: new Date().toISOString(),
        },
        { _id: 'a2', action: 'task_created', details: '', createdAt: new Date().toISOString() },
      ],
    });
    render(<TaskDetailDrawer {...props} />);
    await loaded();

    expect(screen.getByText('moved to In Progress')).toBeInTheDocument();
    // A bare action code is humanised rather than shown raw.
    expect(screen.getByText('task created')).toBeInTheDocument();
  });

  it('hands the loaded task to Edit and Delete', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<TaskDetailDrawer {...props} onEdit={onEdit} onDelete={onDelete} />);
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: /^Edit/ }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ _id: TASK_ID }));

    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ _id: TASK_ID }));
  });

  it('toggles the favourite and reports the new state', async () => {
    api.toggleFavorite.mockResolvedValue({ data: {} });
    api.getTask
      .mockResolvedValueOnce({ data: task() })
      .mockResolvedValue({ data: task({ isFavorite: true }) });
    const onChanged = vi.fn();

    render(<TaskDetailDrawer {...props} onChanged={onChanged} />);
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Favorite' }));

    await waitFor(() => expect(api.toggleFavorite).toHaveBeenCalledWith(TASK_ID));
    expect(await screen.findByRole('button', { name: 'Favorited' })).toBeInTheDocument();
    // The list outside the drawer has to learn about it too.
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ isFavorite: true }));
  });
});
