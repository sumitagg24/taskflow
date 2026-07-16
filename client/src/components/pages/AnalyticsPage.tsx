import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn, PRIORITY_COLORS } from '@/lib/utils';
import { getStats } from '@/api/tasks';
import {
  BarChart3, TrendingUp, TrendingDown,
  Activity, Calendar, Target, Clock,
  Loader2, Award, AlertCircle, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

export default function AnalyticsPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [timeframe, setTimeframe] = useState<'week' | 'month' | 'all'>('week');

  useEffect(() => { loadData(); }, [timeframe]);

  const loadData = async () => {
    setLoadError(false);
    try {
      const statsRes = await getStats({ timeframe });
      setStats(statsRes.data);
    } catch {
      setLoadError(true);
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

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
        <p className="text-gray-500 dark:text-gray-400">Failed to load analytics</p>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-400 text-gray-900 text-sm font-medium hover:bg-yellow-500 transition-colors"
        >
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    );
  }

  const total = stats?.total || 0;
  const completed = stats?.byStatus?.find((s: any) => s._id === 'completed')?.count || 0;
  const inProgress = stats?.byStatus?.find((s: any) => s._id === 'in-progress')?.count || 0;
  const pending = stats?.byStatus?.find((s: any) => s._id === 'pending')?.count || 0;
  const overdue = stats?.overdue || 0;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const priorityData = stats?.byPriority || [];
  const categoryData = stats?.byCategory || [];

  const findPct = (arr: any[], id: string) => {
    const item = arr.find((a: any) => a._id === id);
    return total > 0 ? Math.round(((item?.count || 0) / total) * 100) : 0;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 lg:p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 size={24} className="text-yellow-500" />
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Analytics</h2>
            <p className="text-sm text-gray-400">Track your productivity and progress</p>
          </div>
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {(['week', 'month', 'all'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                timeframe === t
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              {t === 'week' ? 'Week' : t === 'month' ? 'Month' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Tasks', value: total, icon: Target, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10', trend: null },
          { label: 'Completed', value: completed, icon: TrendingUp, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-500/10', trend: 'up' },
          { label: 'In Progress', value: inProgress, icon: Activity, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10', trend: null },
          { label: 'Overdue', value: overdue, icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10', trend: 'down' },
        ].map(metric => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={cn('rounded-xl p-2.5', metric.bg)}>
                  <Icon size={20} className={metric.color} />
                </div>
                {metric.trend === 'up' && <TrendingUp size={16} className="text-green-500" />}
                {metric.trend === 'down' && <TrendingDown size={16} className="text-red-500" />}
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{metric.value}</p>
              <p className="text-sm text-gray-500">{metric.label}</p>
            </div>
          );
        })}
      </div>

      {/* Completion Rate */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Award size={18} className="text-yellow-500" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Completion Rate</h3>
          </div>
          <span className="text-2xl font-bold text-yellow-500">{completionRate}%</span>
        </div>
        <div className="h-4 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-green-400 transition-all duration-1000"
            style={{ width: `${completionRate}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span>{completed} completed</span>
          <span>{total - completed} remaining</span>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Priority Distribution */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={18} className="text-yellow-500" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Priority Distribution</h3>
          </div>
          <div className="space-y-3">
            {['critical', 'high', 'medium', 'low', 'none'].map(p => {
              const count = priorityData.find((d: any) => d._id === p)?.count || 0;
              const pct = findPct(priorityData, p);
              const colors = PRIORITY_COLORS;
              return (
                <div key={p} className="flex items-center gap-3">
                  <span className="w-16 text-xs text-gray-500 capitalize">{p}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all duration-500', colors[p])} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-xs text-gray-500 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Distribution */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} className="text-yellow-500" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">By Category</h3>
          </div>
          {categoryData.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">No category data yet</div>
          ) : (
            <div className="space-y-3">
              {categoryData.map((cat: any) => {
                const pct = total > 0 ? Math.round((cat.count / total) * 100) : 0;
                const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-yellow-500', 'bg-orange-500', 'bg-pink-500', 'bg-emerald-500', 'bg-indigo-500'];
                const colorIdx = categoryData.indexOf(cat) % colors.length;
                return (
                  <div key={cat._id} className="flex items-center gap-3">
                    <span className="w-20 text-xs text-gray-500 capitalize truncate">{cat._id}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all duration-500', colors[colorIdx])} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 text-xs text-gray-500 text-right">{cat.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={18} className="text-yellow-500" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Status Overview</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { status: 'backlog', label: 'Backlog', color: 'bg-gray-400' },
            { status: 'pending', label: 'To Do', color: 'bg-blue-500' },
            { status: 'in-progress', label: 'In Progress', color: 'bg-orange-500' },
            { status: 'completed', label: 'Completed', color: 'bg-green-500' },
          ].map(col => {
            const count = stats?.byStatus?.find((s: any) => s._id === col.status)?.count || 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
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
      </div>

      {/* Stats summary */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={18} className="text-yellow-500" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Quick Stats</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-green-500">{stats?.completedToday || 0}</p>
            <p className="text-xs text-gray-400">Done Today</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-500">{total - completed}</p>
            <p className="text-xs text-gray-400">Active Tasks</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-purple-500">{categoryData.length}</p>
            <p className="text-xs text-gray-400">Categories</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-500">{completionRate}%</p>
            <p className="text-xs text-gray-400">Completion</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
