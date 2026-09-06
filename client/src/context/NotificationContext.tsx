import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { getNotifications, default as api } from '@/api/tasks';
import { useAuth } from './AuthContext';

const SOCKET_URL = import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin;

const TOAST_TYPES = new Set(['task_assigned', 'task_overdue', 'task_due_soon', 'mention']);

interface NotificationContextType {
  unreadCount: number;
  refreshKey: number;
  refresh: () => Promise<void>;
  refreshCount: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  // Single-flight: on an auth rejection, renew the cookie session once so
  // socket.io's own retry then succeeds with fresh cookies — instead of
  // hammering the server with a dead session until some API call happens
  // to refresh. Reset on every successful connect.
  const authRetryRef = useRef(false);
  const failedToastShown = useRef(false);
  const { isAuthenticated, user } = useAuth();
  const userId = user?._id ?? null;

  const refreshCount = useCallback(async () => {
    try {
      const { data } = await getNotifications({ unreadOnly: true, limit: 1 });
      setUnreadCount(data?.unreadCount ?? 0);
    } catch {
      // Count is decoration: toast once per session instead of on every
      // reconnect, then stay silent until the next load succeeds.
      if (!failedToastShown.current) {
        failedToastShown.current = true;
        toast.error('Could not refresh notifications');
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshKey(k => k + 1);
    await refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;

    // Cookie-only: the httpOnly `accessToken` cookie rides the ws upgrade via
    // withCredentials — no auth.token needed (server reads the cookie).
    const socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      authRetryRef.current = false;
      refreshCount();
    });

    socket.on('connect_error', (err: any) => {
      const msg = String(err?.message || '');
      if (!/invalid token|authentication required/i.test(msg) || authRetryRef.current) return;
      authRetryRef.current = true;
      api.post('/api/auth/refresh-token').catch(() => {
        // Refresh failed (e.g. signed out elsewhere) — leave socket.io's
        // backoff alone; it stops mattering once the session is gone.
      });
    });

    socket.on('notification:new', (notification: any) => {
      if (!notification?.isRead) {
        setUnreadCount(c => c + 1);
        setRefreshKey(k => k + 1);
        if (TOAST_TYPES.has(notification.type)) {
          toast(notification.title || 'New notification', {
            description: notification.message,
            action: {
              label: 'View',
              onClick: () => {
                window.dispatchEvent(new CustomEvent('open-task', { detail: { id: notification.relatedId } }));
              },
            },
          });
        }
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [refreshCount, isAuthenticated, userId]);

  return (
    <NotificationContext.Provider value={{ unreadCount, refreshKey, refresh, refreshCount }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within a NotificationProvider');
  return context;
}