import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/api/tasks';
import { useNotifications } from '@/context/NotificationContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Bell, CheckCheck, Mail, MailOpen,
  Calendar, Clock, UserPlus, MessageSquare,
  AlertTriangle, Sparkles, Trash2, CheckCircle2,
  Loader2, AlertCircle, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

const typeConfig: Record<string, { icon: any; color: string; bg: string }> = {
  task_assigned: { icon: UserPlus, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
  task_completed: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-500/10' },
  deadline_reminder: { icon: Clock, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10' },
  comment_added: { icon: MessageSquare, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10' },
  status_changed: { icon: Calendar, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-500/10' },
  mention: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10' },
  due_date_approaching: { icon: Clock, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10' },
  daily_digest: { icon: Sparkles, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-500/10' },
  system: { icon: Bell, color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-800' },
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { refreshKey, refreshCount } = useNotifications();

  useEffect(() => { load(); }, [refreshKey]);

  const load = async () => {
    setLoadError(false);
    try {
      const { data } = await getNotifications();
      // Backend returns { items, pagination, unreadCount } — flatten for the UI.
      setNotifications(Array.isArray(data) ? data : (data?.items ?? []));
    } catch {
      setLoadError(true);
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
      refreshCount();
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      refreshCount();
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    }
  };

  const handleOpen = (notif: any) => {
    if (!notif.isRead) handleMarkRead(notif._id);
    if (notif.relatedType === 'task' && notif.relatedId) {
      window.dispatchEvent(new CustomEvent('open-task', { detail: { id: notif.relatedId } }));
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-yellow-500" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-gray-500 dark:text-gray-400">Failed to load notifications</p>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-400 text-gray-900 text-sm font-medium hover:bg-yellow-500 transition-colors"
        >
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 lg:p-6 max-w-3xl mx-auto"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell size={24} className="text-yellow-500" />
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Notifications</h2>
            <p className="text-sm text-gray-400">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <Button onClick={handleMarkAllRead} variant="ghost" size="sm" icon={<CheckCheck size={14} />}>
            Mark all read
          </Button>
        )}
      </div>

      <div className="space-y-1">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card p-4 flex items-start gap-3">
              <div className="skeleton h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-48" />
                <div className="skeleton h-3 w-32" />
              </div>
            </div>
          ))
        ) : notifications.length === 0 ? (
          <div className="card p-12 text-center">
            <Bell size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No notifications yet</p>
            <p className="text-sm text-gray-400 mt-1">Activity and reminders will appear here</p>
          </div>
        ) : (
          notifications.map((notif, i) => {
            const config = typeConfig[notif.type] || typeConfig.system;
            const Icon = config.icon;
            return (
              <motion.div
                key={notif._id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className={cn(
                  'card p-4 flex items-start gap-3 cursor-pointer transition-all hover:shadow-md',
                  !notif.isRead && 'ring-1 ring-yellow-400/30 bg-yellow-50/30 dark:bg-yellow-500/5'
                )}
                onClick={() => handleOpen(notif)}
              >
                <div className={cn('rounded-full p-2.5 shrink-0', config.bg)}>
                  <Icon size={16} className={config.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn(
                      'text-sm',
                      notif.isRead ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100 font-medium'
                    )}>
                      {notif.title}
                    </p>
                    {!notif.isRead && (
                      <span className="h-2 w-2 rounded-full bg-yellow-400 shrink-0 mt-1.5" />
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{notif.message}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] text-gray-400">{timeAgo(notif.createdAt)}</span>
                    {notif.isRead ? (
                      <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                        <MailOpen size={10} /> Read
                      </span>
                    ) : (
                      <span className="text-[10px] text-yellow-500 font-medium flex items-center gap-0.5">
                        <Mail size={10} /> New
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}
