import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, CheckCircle2, ArrowRight, MessageSquare } from 'lucide-react';
import { getActivityLog } from '@/api/tasks';
import { cn } from '@/lib/utils';

const actionIcons: Record<string, { icon: any; color: string; bg: string }> = {
  task_created: { icon: ArrowRight, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-500/10' },
  task_completed: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-500/10' },
  task_status_changed: { icon: ArrowRight, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
  task_updated: { icon: ArrowRight, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-500/10' },
  task_deleted: { icon: Clock, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10' },
  comment_added: { icon: MessageSquare, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10' },
  task_assigned: { icon: ArrowRight, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10' },
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ActivityTimeline() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivities();
  }, []);

  const loadActivities = async () => {
    try {
      const { data } = await getActivityLog();
      setActivities(data.slice(0, 10));
    } catch {}
    setLoading(false);
  };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={18} className="text-yellow-500" />
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Activity</h3>
      </div>

      <div className="space-y-0">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 py-3">
              <div className="skeleton h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-3 w-24" />
              </div>
            </div>
          ))
        ) : activities.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">No recent activity</div>
        ) : (
          activities.map((activity, i) => {
            const action = actionIcons[activity.action] || actionIcons.task_updated;
            const Icon = action.icon;
            return (
              <motion.div
                key={activity._id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-start gap-3 py-2.5 group"
              >
                <div className={cn('rounded-full p-1.5 shrink-0 mt-0.5', action.bg)}>
                  <Icon size={12} className={action.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{activity.userName}</span>{' '}
                    {activity.details || activity.action.replace(/_/g, ' ')}
                  </p>
                  {activity.taskTitle && (
                    <p className="text-xs text-gray-400 truncate">"{activity.taskTitle}"</p>
                  )}
                </div>
                <span className="text-[10px] text-gray-400 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {timeAgo(activity.createdAt)}
                </span>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
