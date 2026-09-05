import axios, { AxiosInstance, AxiosResponse } from 'axios';

interface TaskParams {
  status?: string;
  priority?: string;
  sort?: string;
  search?: string;
  category?: string;
  tag?: string;
  isFavorite?: string;
  dueDateBefore?: string;
  dueDateAfter?: string;
  page?: number;
  limit?: number;
  paginate?: boolean;
}

interface AuthCredentials {
  identifier: string;
  password: string;
}

interface RegisterData {
  name: string;
  username: string;
  email: string;
  password: string;
}

interface ProfileData {
  name?: string;
  bio?: string;
  avatar?: string;
  preferences?: {
    theme?: string;
    notifications?: boolean;
    emailNotifications?: boolean;
  };
  pomodoroSettings?: {
    workDuration?: number;
    breakDuration?: number;
    longBreakDuration?: number;
    sessionsBeforeLongBreak?: number;
  };
}

const api: AxiosInstance = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  // Cookies (httpOnly access/refresh) ride every same-origin request.
  withCredentials: true,
});

const REFRESH_URL = '/api/auth/refresh-token';

let isRefreshing = false;
let failedQueue: Array<{ resolve: (value: any) => void; reject: (reason?: any) => void }> = [];

const processQueue = (error: any) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(null);
    }
  });
  failedQueue = [];
};

api.interceptors.request.use((config) => {
  // Cookie-first: httpOnly cookies ride via withCredentials, so no token
  // handling is needed here. Legacy Bearer fallback for native/API consumers
  // (and existing header-based tests) that still hold a token in storage.
  try {
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // storage unavailable (private mode) — cookies still ride.
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      !originalRequest ||
      originalRequest._isRefresh ||
      error.response?.status !== 401 ||
      error.response?.data?.code !== 'TOKEN_EXPIRED'
    ) {
      return Promise.reject(error);
    }

    if (!originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, rejectFn) => {
          failedQueue.push({ resolve, reject: rejectFn });
        })
          .then(() => {
            // Cookies were rotated by the in-flight refresh — just retry.
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      isRefreshing = true;

      try {
        // Cookie-only refresh: httpOnly `refreshToken` cookie rides via
        // withCredentials, no body, no token juggling — just retry.
        await axios.post(REFRESH_URL, {}, { withCredentials: true });
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        window.location.reload();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (data: AuthCredentials): Promise<AxiosResponse> => api.post('/auth/login', data),
  register: (data: RegisterData): Promise<AxiosResponse> => api.post('/auth/register', data),
  checkUsername: (username: string): Promise<AxiosResponse> => api.post('/auth/check-username', { username }),
  getProfile: (): Promise<AxiosResponse> => api.get('/auth/profile'),
  updateProfile: (data: ProfileData): Promise<AxiosResponse> => api.put('/auth/profile', data),
  updateFocusTime: (minutes: number): Promise<AxiosResponse> => api.post('/auth/focus-time', { minutes }),
  forgotPassword: (email: string): Promise<AxiosResponse> => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string): Promise<AxiosResponse> => api.post('/auth/reset-password', { token, password }),
  verifyEmail: (token: string): Promise<AxiosResponse> => api.post('/auth/verify-email', { token }),
  resendVerification: (email: string): Promise<AxiosResponse> => api.post('/auth/resend-verification', { email }),
  googleAuth: (credential: string): Promise<AxiosResponse> => api.post('/auth/google', { credential }),
  exchangeOAuthCode: (code: string): Promise<AxiosResponse> => api.post('/auth/oauth/exchange', { code }),
  getProviders: (): Promise<AxiosResponse<{ google: boolean; github: boolean }>> =>
    api.get('/auth/providers'),
  changePassword: (currentPassword: string, newPassword: string): Promise<AxiosResponse> => api.post('/auth/change-password', { currentPassword, newPassword }),
};

export const getTasks = (params?: TaskParams): Promise<AxiosResponse> => api.get('/tasks', { params });

/**
 * `GET /tasks` returns `{ data, page, limit, total, totalPages }` unless
 * `?paginate=false` was sent (legacy bare array). Every list caller unwraps
 * through here so neither shape can crash a `.map`/`.filter`.
 */
export const toTaskArray = (data: unknown): any[] => {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: any[] }).data;
  }
  return [];
};
export const getTask = (id: string): Promise<AxiosResponse> => api.get(`/tasks/${id}`);
export const createTask = (data: any): Promise<AxiosResponse> => api.post('/tasks', data);
export const updateTask = (id: string, data: any): Promise<AxiosResponse> => api.put(`/tasks/${id}`, data);
export const deleteTask = (id: string): Promise<AxiosResponse> => api.delete(`/tasks/${id}`);

export const addSubtask = (taskId: string, subtaskTitle: string): Promise<AxiosResponse> => api.post(`/tasks/${taskId}/subtasks`, { title: subtaskTitle });
export const updateSubtask = (taskId: string, subtaskId: string, data: { title?: string; completed: boolean }): Promise<AxiosResponse> => api.put(`/tasks/${taskId}/subtasks/${subtaskId}`, data);
export const deleteSubtask = (taskId: string, subtaskId: string): Promise<AxiosResponse> => api.delete(`/tasks/${taskId}/subtasks/${subtaskId}`);

export const addComment = (taskId: string, text: string): Promise<AxiosResponse> => api.post(`/tasks/${taskId}/comments`, { text });
export const deleteComment = (taskId: string, commentId: string): Promise<AxiosResponse> => api.delete(`/tasks/${taskId}/comments/${commentId}`);

export const startTimer = (taskId: string): Promise<AxiosResponse> => api.post(`/tasks/${taskId}/timer/start`);
export const stopTimer = (taskId: string): Promise<AxiosResponse> => api.post(`/tasks/${taskId}/timer/stop`);

export const toggleFavorite = (taskId: string): Promise<AxiosResponse> => api.post(`/tasks/${taskId}/favorite`);

export const updateOrder = (orders: { _id: string; order: number; status: string }[]): Promise<AxiosResponse> => api.put('/tasks/order', { orders });
export const batchUpdate = (taskIds: string[], updates: any): Promise<AxiosResponse> => api.post('/tasks/batch', { taskIds, updates });

export const getStats = (params?: { timeframe?: string }): Promise<AxiosResponse> => api.get('/tasks/stats', { params });
// Omitting `taskId` returns the account-wide feed (the Dashboard's activity
// rail); passing one returns just that task's history for the detail drawer.
export const getActivityLog = (params?: { taskId?: string; limit?: number }): Promise<AxiosResponse> =>
  api.get('/tasks/activity', { params });

// Insights — productivity score, streaks, velocity/burndown series and time
// reports. `tzOffset` is sent so day buckets line up with the user's calendar
// rather than the server's UTC midnight.
export const getInsights = (days = 30): Promise<AxiosResponse> =>
  api.get('/tasks/insights', { params: { days, tzOffset: new Date().getTimezoneOffset() } });

// Trash. `deleteTask` is a soft delete, so it pairs with `restoreTask` for the
// undo affordance; `purgeTask`/`emptyTrash` are the only irreversible calls.
export const getTrash = (): Promise<AxiosResponse> => api.get('/tasks/trash');
export const restoreTask = (id: string): Promise<AxiosResponse> => api.post(`/tasks/${id}/restore`);
export const purgeTask = (id: string): Promise<AxiosResponse> => api.delete(`/tasks/${id}/purge`);
export const emptyTrash = (): Promise<AxiosResponse> => api.delete('/tasks/trash');

// Notifications — separate /api/notifications resource. The response is a
// structured object { items, pagination, unreadCount }; callers that want
// just the list should read `data.items`.
export const getNotifications = (params?: { unreadOnly?: boolean; page?: number; limit?: number }): Promise<AxiosResponse> =>
  api.get('/notifications', { params });
export const markNotificationRead = (id: string): Promise<AxiosResponse> => api.put(`/notifications/${id}/read`);
export const markAllNotificationsRead = (): Promise<AxiosResponse> => api.put('/notifications/read-all');
export const deleteNotification = (id: string): Promise<AxiosResponse> => api.delete(`/notifications/${id}`);

// Templates — wired to the existing /api/templates backend.
export const templatesAPI = {
  list: (params?: { category?: string; tag?: string }): Promise<AxiosResponse> => api.get('/templates', { params }),
  shared: (): Promise<AxiosResponse> => api.get('/templates/shared'),
  get: (id: string): Promise<AxiosResponse> => api.get(`/templates/${id}`),
  create: (data: any): Promise<AxiosResponse> => api.post('/templates', data),
  update: (id: string, data: any): Promise<AxiosResponse> => api.put(`/templates/${id}`, data),
  remove: (id: string): Promise<AxiosResponse> => api.delete(`/templates/${id}`),
  apply: (id: string): Promise<AxiosResponse> => api.post(`/templates/${id}/apply`),
  copy: (id: string): Promise<AxiosResponse> => api.post(`/templates/${id}/copy`),
};

// Time tracking — wired to /api/time-tracking.
export const timeTrackingAPI = {
  start: (taskId: string, notes?: string): Promise<AxiosResponse> =>
    api.post(`/time-tracking/${taskId}/start`, notes ? { notes } : {}),
  stop: (taskId: string): Promise<AxiosResponse> => api.post(`/time-tracking/${taskId}/stop`),
  pause: (taskId: string): Promise<AxiosResponse> => api.post(`/time-tracking/${taskId}/pause`),
  resume: (taskId: string): Promise<AxiosResponse> => api.post(`/time-tracking/${taskId}/resume`),
  active: (taskId: string): Promise<AxiosResponse> => api.get(`/time-tracking/${taskId}`),
  history: (params?: { taskId?: string; startDate?: string; endDate?: string; page?: number; limit?: number }): Promise<AxiosResponse> =>
    api.get('/time-tracking/history', { params }),
  report: (params?: { period?: 'week' | 'month' | 'year'; startDate?: string; endDate?: string }): Promise<AxiosResponse> =>
    api.get('/time-tracking/report', { params }),
  exportUrl: (startDate?: string, endDate?: string): string => {
    const qs = new URLSearchParams();
    if (startDate) qs.set('startDate', startDate);
    if (endDate) qs.set('endDate', endDate);
    const base = '/api/time-tracking/export';
    return qs.toString() ? `${base}?${qs.toString()}` : base;
  },
};

// Calendar — wired to /api/calendar. exportUrl returns a path you can hand
// to <a href=…> or to a fetch with a bearer token; getLinksForTask returns
// Google/Outlook/Apple web URLs.
export const calendarAPI = {
  exportUrl: (params?: { status?: string; priority?: string; category?: string; tag?: string }): string => {
    const qs = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v) qs.set(k, String(v));
      }
    }
    const base = '/api/calendar/export';
    return qs.toString() ? `${base}?${qs.toString()}` : base;
  },
  getLinks: (taskId: string): Promise<AxiosResponse> => api.get('/calendar/links', { params: { taskId } }),
};

export const aiAPI = {
  parseTask: (input: string): Promise<AxiosResponse> => api.post('/ai/parse', { input }),
  breakdownTask: (taskId: string): Promise<AxiosResponse> => api.post(`/ai/breakdown/${taskId}`, null),
  suggestPriorities: (): Promise<AxiosResponse> => api.post('/ai/suggest-priorities'),
  generateDigest: (): Promise<AxiosResponse> => api.get('/ai/digest'),
  chat: (message: string): Promise<AxiosResponse> => api.post('/ai/chat', { message }),
  generateTitle: (description: string): Promise<AxiosResponse> => api.post('/ai/generate-title', { description }),
  suggestNextAction: (): Promise<AxiosResponse> => api.get('/ai/suggest-next-action'),
};

export const aiSettingsAPI = {
  getSettings: (): Promise<AxiosResponse> => api.get('/auth/ai-settings'),
  updateSettings: (data: {
    aiProvider?: string | null;
    aiApiKey?: string;
    aiModel?: string;
    aiBaseUrl?: string;
    aiSettings?: {
      temperature?: number;
      maxTokens?: number;
      streaming?: boolean;
      timeout?: number;
    };
  }): Promise<AxiosResponse> => api.put('/auth/ai-settings', data),
  removeSettings: (): Promise<AxiosResponse> => api.delete('/auth/ai-settings'),
  testConnection: (data?: {
    aiProvider?: string;
    aiApiKey?: string;
    aiModel?: string;
    aiBaseUrl?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  }): Promise<AxiosResponse> => api.post('/auth/ai-settings/test', data || {}),
};

// ── Growth: plan tiers, usage limits, referrals and invites ────────────────
// One GET backs the whole surface so the plan shown and the plan enforced come
// from the same source (server/config/plans.js).

export interface PlanLimits {
  activeTasks: number | null;
  templates: number | null;
  savedViews: number | null;
  aiRequestsPerDay: number | null;
  attachmentsPerTask: number | null;
}

export interface Plan {
  id: 'free' | 'pro' | 'team';
  name: string;
  price: number;
  blurb?: string;
  features?: string[];
  limits: PlanLimits;
}

/** `limit: null` means unlimited — render it as such rather than as a meter. */
export interface UsageCheck {
  allowed: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
}

export interface Invite {
  email: string;
  invitedAt: string;
  acceptedAt: string | null;
  status: 'pending' | 'accepted';
}

export interface GrowthState {
  plan: Plan;
  plans: Plan[];
  usage: { activeTasks: UsageCheck; templates: UsageCheck };
  referral: {
    code: string;
    link: string;
    credits: number;
    maxCredits: number;
    signups: number;
  };
  invites: Invite[];
}

export const growthAPI = {
  get: (): Promise<AxiosResponse<GrowthState>> => api.get('/growth'),
  invite: (email: string): Promise<AxiosResponse> => api.post('/growth/invite', { email }),
  revokeInvite: (email: string): Promise<AxiosResponse> =>
    api.delete(`/growth/invite/${encodeURIComponent(email)}`),
};

/**
 * The server answers a create that would breach the plan ceiling with 402 and
 * `code: 'PLAN_LIMIT_REACHED'`. Callers use this to show an upgrade prompt
 * instead of a generic "something went wrong".
 */
export interface PlanLimitError {
  message: string;
  code: 'PLAN_LIMIT_REACHED';
  limit: number;
  used: number;
  resource: string;
}

export const asPlanLimitError = (error: any): PlanLimitError | null => {
  const data = error?.response?.data;
  return error?.response?.status === 402 && data?.code === 'PLAN_LIMIT_REACHED' ? data : null;
};

export const exportTasks = (format: string = 'json'): Promise<AxiosResponse> => {
  return api.get(`/tasks/export?format=${format}`, { responseType: 'blob' });
};

export const uploadFile = (file: File): Promise<AxiosResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export default api;
