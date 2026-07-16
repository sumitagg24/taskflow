import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');

const mockedAxios = vi.mocked(axios);

// Create a valid interceptor mock
const interceptorMock = {
  use: vi.fn((fn: any) => {
    // Store the interceptor function for testing
    if (fn) interceptorMock.fn = fn;
    return 0;
  }),
  fn: null as any,
};

beforeEach(() => {
  vi.clearAllMocks();

  // Reset axios mock methods
  mockedAxios.create = vi.fn().mockReturnValue(mockedAxios);
  mockedAxios.interceptors = {
    request: { use: interceptorMock.use },
    response: { use: vi.fn() },
  } as any;

  // Mock HTTP methods
  mockedAxios.get = vi.fn().mockResolvedValue({ data: {} });
  mockedAxios.post = vi.fn().mockResolvedValue({ data: {} });
  mockedAxios.put = vi.fn().mockResolvedValue({ data: {} });
  mockedAxios.delete = vi.fn().mockResolvedValue({ data: {} });
  mockedAxios.patch = vi.fn().mockResolvedValue({ data: {} });

  localStorage.clear();
});

describe('Auth API', () => {
  it('authAPI.login sends POST to /auth/login', async () => {
    const { authAPI } = await import('./tasks');
    await authAPI.login({ identifier: 'test@test.com', password: '123456' });

    expect(mockedAxios.post).toHaveBeenCalledWith('/auth/login', {
      identifier: 'test@test.com',
      password: '123456',
    });
  });

  it('authAPI.register sends POST to /auth/register', async () => {
    const { authAPI } = await import('./tasks');
    await authAPI.register({ name: 'Test', username: 'testuser', email: 'test@test.com', password: '123456' });

    expect(mockedAxios.post).toHaveBeenCalledWith('/auth/register', {
      name: 'Test',
      username: 'testuser',
      email: 'test@test.com',
      password: '123456',
    });
  });

  it('authAPI.forgotPassword sends POST to /auth/forgot-password', async () => {
    const { authAPI } = await import('./tasks');
    await authAPI.forgotPassword('test@test.com');
    expect(mockedAxios.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'test@test.com' });
  });

  it('authAPI.resetPassword sends POST to /auth/reset-password', async () => {
    const { authAPI } = await import('./tasks');
    await authAPI.resetPassword('token123', 'newpass123');
    expect(mockedAxios.post).toHaveBeenCalledWith('/auth/reset-password', { token: 'token123', password: 'newpass123' });
  });

  it('authAPI.getProfile sends GET to /auth/profile', async () => {
    const { authAPI } = await import('./tasks');
    await authAPI.getProfile();
    expect(mockedAxios.get).toHaveBeenCalledWith('/auth/profile');
  });

  it('authAPI.updateProfile sends PUT to /auth/profile', async () => {
    const { authAPI } = await import('./tasks');
    await authAPI.updateProfile({ name: 'New Name' });
    expect(mockedAxios.put).toHaveBeenCalledWith('/auth/profile', { name: 'New Name' });
  });

  it('authAPI.updateFocusTime sends POST to /auth/focus-time', async () => {
    const { authAPI } = await import('./tasks');
    await authAPI.updateFocusTime(25);
    expect(mockedAxios.post).toHaveBeenCalledWith('/auth/focus-time', { minutes: 25 });
  });
});

describe('Tasks API', () => {
  it('getTasks sends GET to /tasks with params', async () => {
    const { getTasks } = await import('./tasks');
    await getTasks({ status: 'pending', priority: 'high' });
    expect(mockedAxios.get).toHaveBeenCalledWith('/tasks', { params: { status: 'pending', priority: 'high' } });
  });

  it('getTask sends GET to /tasks/:id', async () => {
    const { getTask } = await import('./tasks');
    await getTask('123');
    expect(mockedAxios.get).toHaveBeenCalledWith('/tasks/123');
  });

  it('createTask sends POST to /tasks', async () => {
    const { createTask } = await import('./tasks');
    await createTask({ title: 'Test Task', priority: 'high' });
    expect(mockedAxios.post).toHaveBeenCalledWith('/tasks', { title: 'Test Task', priority: 'high' });
  });

  it('updateTask sends PUT to /tasks/:id', async () => {
    const { updateTask } = await import('./tasks');
    await updateTask('1', { status: 'completed' });
    expect(mockedAxios.put).toHaveBeenCalledWith('/tasks/1', { status: 'completed' });
  });

  it('deleteTask sends DELETE to /tasks/:id', async () => {
    const { deleteTask } = await import('./tasks');
    await deleteTask('123');
    expect(mockedAxios.delete).toHaveBeenCalledWith('/tasks/123');
  });
});

describe('Task Operations API', () => {
  it('addSubtask sends POST to /tasks/:id/subtasks', async () => {
    const { addSubtask } = await import('./tasks');
    await addSubtask('1', 'Subtask title');
    expect(mockedAxios.post).toHaveBeenCalledWith('/tasks/1/subtasks', { title: 'Subtask title' });
  });

  it('toggleFavorite sends POST to /tasks/:id/favorite', async () => {
    const { toggleFavorite } = await import('./tasks');
    await toggleFavorite('1');
    expect(mockedAxios.post).toHaveBeenCalledWith('/tasks/1/favorite');
  });

  it('startTimer sends POST to /tasks/:id/timer/start', async () => {
    const { startTimer } = await import('./tasks');
    await startTimer('1');
    expect(mockedAxios.post).toHaveBeenCalledWith('/tasks/1/timer/start');
  });

  it('stopTimer sends POST to /tasks/:id/timer/stop', async () => {
    const { stopTimer } = await import('./tasks');
    await stopTimer('1');
    expect(mockedAxios.post).toHaveBeenCalledWith('/tasks/1/timer/stop');
  });

  it('batchUpdate sends POST to /tasks/batch', async () => {
    const { batchUpdate } = await import('./tasks');
    await batchUpdate(['1', '2'], { status: 'completed' });
    expect(mockedAxios.post).toHaveBeenCalledWith('/tasks/batch', { taskIds: ['1', '2'], updates: { status: 'completed' } });
  });

  it('addComment sends POST to /tasks/:id/comments', async () => {
    const { addComment } = await import('./tasks');
    await addComment('1', 'Great work!');
    expect(mockedAxios.post).toHaveBeenCalledWith('/tasks/1/comments', { text: 'Great work!' });
  });
});

describe('Stats & Activity API', () => {
  it('getStats sends GET to /tasks/stats', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({ data: { total: 5 } });
    const { getStats } = await import('./tasks');
    const result = await getStats();
    expect(mockedAxios.get).toHaveBeenCalledWith('/tasks/stats');
    expect(result.data.total).toBe(5);
  });

  it('getActivityLog sends GET to /tasks/activity', async () => {
    const { getActivityLog } = await import('./tasks');
    await getActivityLog();
    expect(mockedAxios.get).toHaveBeenCalledWith('/tasks/activity');
  });

  it('getNotifications sends GET to /notifications with default params', async () => {
    const { getNotifications } = await import('./tasks');
    await getNotifications();
    expect(mockedAxios.get).toHaveBeenCalledWith('/notifications', { params: undefined });
  });

  it('getNotifications sends unreadOnly flag when requested', async () => {
    const { getNotifications } = await import('./tasks');
    await getNotifications({ unreadOnly: true, page: 2, limit: 10 });
    expect(mockedAxios.get).toHaveBeenCalledWith('/notifications', { params: { unreadOnly: true, page: 2, limit: 10 } });
  });

  it('markAllNotificationsRead sends PUT to /notifications/read-all', async () => {
    const { markAllNotificationsRead } = await import('./tasks');
    await markAllNotificationsRead();
    expect(mockedAxios.put).toHaveBeenCalledWith('/notifications/read-all');
  });

  it('markNotificationRead sends PUT to /notifications/:id/read', async () => {
    const { markNotificationRead } = await import('./tasks');
    await markNotificationRead('abc123');
    expect(mockedAxios.put).toHaveBeenCalledWith('/notifications/abc123/read');
  });

  it('deleteNotification sends DELETE to /notifications/:id', async () => {
    const { deleteNotification } = await import('./tasks');
    await deleteNotification('abc123');
    expect(mockedAxios.delete).toHaveBeenCalledWith('/notifications/abc123');
  });
});

describe('AI API', () => {
  it('aiAPI.chat sends POST to /ai/chat', async () => {
    const { aiAPI } = await import('./tasks');
    await aiAPI.chat('Hello');
    expect(mockedAxios.post).toHaveBeenCalledWith('/ai/chat', { message: 'Hello' });
  });

  it('aiAPI.generateDigest sends GET to /ai/digest', async () => {
    const { aiAPI } = await import('./tasks');
    await aiAPI.generateDigest();
    expect(mockedAxios.get).toHaveBeenCalledWith('/ai/digest');
  });

  it('aiAPI.parseTask sends POST to /ai/parse', async () => {
    const { aiAPI } = await import('./tasks');
    await aiAPI.parseTask('Buy groceries tomorrow');
    expect(mockedAxios.post).toHaveBeenCalledWith('/ai/parse', { input: 'Buy groceries tomorrow' });
  });
});

describe('Export & Upload API', () => {
  it('exportTasks sends GET to /tasks/export with format', async () => {
    const { exportTasks } = await import('./tasks');
    await exportTasks('csv');
    expect(mockedAxios.get).toHaveBeenCalledWith('/tasks/export?format=csv', { responseType: 'blob' });
  });
});

describe('Templates API', () => {
  it('templatesAPI.list sends GET to /templates', async () => {
    const { templatesAPI } = await import('./tasks');
    await templatesAPI.list();
    expect(mockedAxios.get).toHaveBeenCalledWith('/templates', { params: undefined });
  });

  it('templatesAPI.create sends POST to /templates', async () => {
    const { templatesAPI } = await import('./tasks');
    await templatesAPI.create({ title: 'My Template' });
    expect(mockedAxios.post).toHaveBeenCalledWith('/templates', { title: 'My Template' });
  });

  it('templatesAPI.apply sends POST to /templates/:id/apply', async () => {
    const { templatesAPI } = await import('./tasks');
    await templatesAPI.apply('abc');
    expect(mockedAxios.post).toHaveBeenCalledWith('/templates/abc/apply');
  });
});

describe('Time Tracking API', () => {
  it('timeTrackingAPI.start sends POST to /time-tracking/:taskId/start', async () => {
    const { timeTrackingAPI } = await import('./tasks');
    await timeTrackingAPI.start('task1');
    expect(mockedAxios.post).toHaveBeenCalledWith('/time-tracking/task1/start', {});
  });

  it('timeTrackingAPI.start with notes sends notes in body', async () => {
    const { timeTrackingAPI } = await import('./tasks');
    await timeTrackingAPI.start('task1', 'working on it');
    expect(mockedAxios.post).toHaveBeenCalledWith('/time-tracking/task1/start', { notes: 'working on it' });
  });

  it('timeTrackingAPI.stop sends POST to /time-tracking/:taskId/stop', async () => {
    const { timeTrackingAPI } = await import('./tasks');
    await timeTrackingAPI.stop('task1');
    expect(mockedAxios.post).toHaveBeenCalledWith('/time-tracking/task1/stop');
  });

  it('timeTrackingAPI.history sends GET with date filters', async () => {
    const { timeTrackingAPI } = await import('./tasks');
    await timeTrackingAPI.history({ startDate: '2024-01-01', endDate: '2024-01-31' });
    expect(mockedAxios.get).toHaveBeenCalledWith('/time-tracking/history', {
      params: { startDate: '2024-01-01', endDate: '2024-01-31' },
    });
  });
});

describe('Calendar API', () => {
  it('calendarAPI.exportUrl returns /api/calendar/export with no params', async () => {
    const { calendarAPI } = await import('./tasks');
    expect(calendarAPI.exportUrl()).toBe('/api/calendar/export');
  });

  it('calendarAPI.exportUrl adds query string for filters', async () => {
    const { calendarAPI } = await import('./tasks');
    expect(calendarAPI.exportUrl({ status: 'pending', priority: 'high' }))
      .toBe('/api/calendar/export?status=pending&priority=high');
  });

  it('calendarAPI.getLinks sends GET with taskId', async () => {
    const { calendarAPI } = await import('./tasks');
    await calendarAPI.getLinks('task1');
    expect(mockedAxios.get).toHaveBeenCalledWith('/calendar/links', { params: { taskId: 'task1' } });
  });
});

describe('Interceptor', () => {
  it('attaches auth token from localStorage', async () => {
    localStorage.setItem('accessToken', 'test-token-123');

    // Re-import to trigger interceptor setup
    const tasks = await import('./tasks');
    const api = tasks.default;

    // Trigger the request interceptor
    const config = { headers: {} };
    const result = interceptorMock.fn(config);

    expect(result.headers.Authorization).toBe('Bearer test-token-123');
  });

  it('does not attach auth token when not in localStorage', async () => {
    const tasks = await import('./tasks');
    const api = tasks.default;

    const config = { headers: {} };
    const result = interceptorMock.fn(config);

    expect(result.headers.Authorization).toBeUndefined();
  });
});
