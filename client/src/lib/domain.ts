/**
 * Shared client domain types.
 *
 * Single source of truth for shapes that cross the API boundary, so pages and
 * widgets stop re-declaring their own copies. `Task` keeps an index signature
 * (`unknown`, not `any`) because list endpoints return trimmed rows while the
 * detail endpoint returns populated ones — callers narrow what they need.
 */

export interface Subtask {
  _id?: string;
  title: string;
  completed: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskComment {
  _id?: string;
  text: string;
  userId?: string;
  userName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type TaskDependencyType = 'blocks' | 'blocked-by';

/** A populated dependency target from the detail endpoint. */
export interface TaskDependencyRef {
  _id: string;
  title?: string;
  status?: string;
}

export interface TaskDependency {
  /** Bare id from list endpoints, populated ref from the detail endpoint. */
  taskId: string | TaskDependencyRef;
  type: TaskDependencyType;
  /** Denormalised for rendering; never sent back verbatim. */
  title?: string;
  status?: string;
}

export interface Task {
  _id: string;
  title: string;
  status: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  tags?: string[];
  category?: string;
  subtasks?: Subtask[];
  comments?: TaskComment[];
  attachments?: { _id?: string; url?: string; name?: string }[];
  estimatedTime?: number;
  timeSpent?: number;
  isRecurring?: boolean;
  recurringInterval?: string;
  recurringEndDate?: string;
  recurringNextDate?: string;
  dependencies?: TaskDependency[];
  isFavorite?: boolean;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
  /** Trimmed vs populated endpoint shapes carry extras; narrow per use. */
  [key: string]: unknown;
}

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

export interface AppNotification {
  _id: string;
  type: string;
  title: string;
  message: string;
  relatedId?: string | null;
  relatedType?: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/** The axios-shaped failure every API caller unwraps. */
export interface ApiError {
  message?: string;
  code?: string;
  status?: number;
  response?: {
    status?: number;
    data?: { message?: string; code?: string; [key: string]: unknown } | null;
  } | null;
}

export function isApiError(e: unknown): e is ApiError {
  if (typeof e !== 'object' || e === null) return false;
  const response = (e as { response?: unknown }).response;
  if (typeof response === 'object' && response !== null) return true;
  return typeof (e as { message?: unknown }).message === 'string';
}

/**
 * `GET /tasks` returns `{ data, page, limit, total, totalPages }` unless
 * `?paginate=false` was sent (legacy bare array). Every list caller unwraps
 * through here so neither shape can crash a `.map`/`.filter`.
 */
export function toTaskArray(data: unknown): Task[] {
  if (Array.isArray(data)) return data as Task[];
  if (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as { data?: unknown }).data)
  ) {
    return (data as { data: Task[] }).data;
  }
  return [];
}

/** Unwrap a list payload regardless of envelope (`[]`, `{ data }`, `{ items }`). */
export function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (typeof data === 'object' && data !== null) {
    const envelope = data as { data?: unknown; items?: unknown };
    if (Array.isArray(envelope.data)) return envelope.data as T[];
    if (Array.isArray(envelope.items)) return envelope.items as T[];
  }
  return [];
}
