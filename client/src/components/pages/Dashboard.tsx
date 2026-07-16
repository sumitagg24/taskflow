import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { getTasks, getStats, aiAPI, getNotifications } from '@/api/tasks';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import {
  ListTodo, ArrowRightCircle, CheckCircle2, Archive,
  Calendar, Clock, Quote,
  BarChart3, Bell,
} from 'lucide-react';
import CalendarWidget from '@/components/widgets/CalendarWidget';
import FocusTimer from '@/components/widgets/FocusTimer';
import ActivityTimeline from '@/components/widgets/ActivityTimeline';
import Analytics from '@/components/widgets/Analytics';
import Categories from '@/components/widgets/Categories';
import Notes from '@/components/widgets/Notes';

interface DashboardProps {
  onEditTask: (task: any) => void;
  onNewTask: () => void;
}

export default function Dashboard({ onEditTask, onNewTask }: DashboardProps) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [digest, setDigest] = useState<any>(null);
  const [recentNotifications, setRecentNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [tasksRes, statsRes] = await Promise.all([
        getTasks({ sort: 'updated', status: '' }),
        getStats(),
      ]);
      setTasks(tasksRes.data);
      setStats(statsRes.data);

      // Try to get AI digest (non-blocking)
      try {
        const digestRes = await aiAPI.generateDigest();
        setDigest(digestRes.data);
      } catch {}

      // Recent notifications preview (non-blocking)
      try {
        const notifRes = await getNotifications({ limit: 3 });
        const items = Array.isArray(notifRes.data) ? notifRes.data : (notifRes.data?.items ?? []);
        setRecentNotifications(items.slice(0, 3));
      } catch {}
    } catch {
      // Dashboard loads without AI — non-critical
    } finally {
      setLoading(false);
    }
  };

  const todayTasks = tasks
    .filter(t => t.status !== 'completed' && t.status !== 'cancelled')
    .slice(0, 5);

  const upcomingDeadlines = tasks
    .filter(t => t.dueDate && t.status !== 'completed')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const getDaysUntilDue = (date: string) => {
    const diff = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'Overdue';
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return `In ${diff} days`;
  };

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  if (loading) {
    return (
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="card p-6">
            <div className="skeleton h-4 w-24 mb-3" />
            <div className="skeleton h-8 w-16 mb-2" />
            <div className="skeleton h-3 w-32" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="p-4 lg:p-6 space-y-6"
    >
      {/* Section 1: Welcome Card */}
      <motion.div variants={item} className="card p-6 bg-gradient-to-br from-yellow-400/10 to-orange-400/5 dark:from-yellow-500/5 dark:to-orange-500/5 border-yellow-200/50 dark:border-yellow-500/10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {digest?.greeting || `${getGreeting()}!`} 👋
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-500">{user?.streak || 0}</p>
              <p className="text-xs text-gray-400">Day Streak</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-500">{stats?.completedToday || 0}</p>
              <p className="text-xs text-gray-400">Done Today</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-500">{stats?.overdue || 0}</p>
              <p className="text-xs text-gray-400">Overdue</p>
            </div>
          </div>
        </div>
        {digest?.quote && (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 italic">
            <Quote size={14} className="text-yellow-400" />
            "{digest.quote}"
          </div>
        )}
      </motion.div>

      {/* Section 2: Task Summary Stats */}
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'To Do', count: stats?.byStatus?.find((s: any) => s._id === 'pending')?.count || 0, icon: ListTodo, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
          { label: 'In Progress', count: stats?.byStatus?.find((s: any) => s._id === 'in-progress')?.count || 0, icon: ArrowRightCircle, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10' },
          { label: 'Completed', count: stats?.byStatus?.find((s: any) => s._id === 'completed')?.count || 0, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-500/10' },
          { label: 'Overdue', count: stats?.overdue || 0, icon: Archive, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10' },
        ].map((stat) => {
          const Icon = stat.icon;
          const total = stats?.total || 1;
          const pct = Math.round((stat.count / total) * 100);
          return (
            <div key={stat.label} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={cn('rounded-xl p-2.5', stat.bg)}>
                  <Icon size={20} className={stat.color} />
                </div>
                <span className={cn('text-xs font-medium', pct > 0 ? 'text-green-500' : 'text-gray-400')}>
                  {pct}%
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stat.count}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
            </div>
          );
        })}
      </motion.div>

      {/* Section 3 & 4: Calendar + Today's Tasks */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CalendarWidget tasks={tasks} />
        
        {/* Today's Tasks */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-yellow-500" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Today's Priority</h3>
            </div>
            <button onClick={onNewTask} className="text-sm text-yellow-600 dark:text-yellow-400 hover:underline">
              View all
            </button>
          </div>
          <div className="space-y-2">
            {todayTasks.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">No tasks for today. Great! 🎉</div>
            ) : (
              todayTasks.map((task) => (
                <button
                  key={task._id}
                  onClick={() => onEditTask(task)}
                  className="w-full flex items-center gap-3 rounded-xl p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left group"
                >
                  <div className={cn(
                    'h-2 w-2 rounded-full shrink-0',
                    task.priority === 'critical' ? 'bg-red-500' :
                    task.priority === 'high' ? 'bg-orange-500' :
                    task.priority === 'medium' ? 'bg-yellow-500' : 'bg-gray-300 dark:bg-gray-600'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{task.title}</p>
                    <p className="text-xs text-gray-400 truncate">{task.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {task.dueDate && (
                      <span className={cn(
                        'text-xs font-medium',
                        new Date(task.dueDate) < new Date() ? 'text-red-500' : 'text-gray-400'
                      )}>
                        {getDaysUntilDue(task.dueDate)}
                      </span>
                    )}
                    <StatusBadge status={task.status} />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </motion.div>

      {/* Section 5: Kanban Preview */}
      <motion.div variants={item} className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-yellow-500" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Quick Overview</h3>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { status: 'pending', label: 'To Do', color: 'bg-blue-500' },
            { status: 'in-progress', label: 'In Progress', color: 'bg-orange-500' },
            { status: 'completed', label: 'Completed', color: 'bg-green-500' },
            { status: 'backlog', label: 'Backlog', color: 'bg-gray-400 dark:bg-gray-600' },
          ].map((col) => {
            const count = stats?.byStatus?.find((s: any) => s._id === col.status)?.count || 0;
            const total = stats?.total || 1;
            const pct = Math.round((count / total) * 100);
            return (
              <div key={col.status} className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">{col.label}</span>
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{count}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all duration-500', col.color)} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Section 6, 7, 8: Activity + Categories + Focus Timer */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ActivityTimeline />
        <Categories tasks={tasks} />
        <FocusTimer />
      </motion.div>

      {/* Section 9 & 10: Analytics + Deadlines */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Analytics stats={stats} />
        
        {/* Upcoming Deadlines */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} className="text-yellow-500" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Upcoming Deadlines</h3>
          </div>
          <div className="space-y-2">
            {upcomingDeadlines.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">No upcoming deadlines</div>
            ) : (
              upcomingDeadlines.map((task) => (
                <button
                  key={task._id}
                  onClick={() => onEditTask(task)}
                  className="w-full flex items-center gap-3 rounded-xl p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                >
                  <PriorityBadge priority={task.priority} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{task.title}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn(
                      'text-xs font-medium',
                      new Date(task.dueDate) < new Date() ? 'text-red-500' : 'text-gray-500'
                    )}>
                      {getDaysUntilDue(task.dueDate)}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </motion.div>

      {/* Section 11 & 12: Notes + Notifications Preview */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Notes />
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bell size={18} className="text-yellow-500" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Recent Notifications</h3>
          </div>
          <div className="space-y-2">
            {recentNotifications.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">No new notifications</div>
            ) : (
              recentNotifications.map((n: any) => (
                <div key={n._id} className="flex items-center gap-3 rounded-xl p-3 bg-gray-50 dark:bg-gray-800/50">
                  <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Bell size={14} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{n.title || 'Notification'}</p>
                    {n.message && <p className="text-xs text-gray-400 truncate">{n.message}</p>}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{timeAgo(n.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
