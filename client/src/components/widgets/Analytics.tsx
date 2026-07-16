import { cn, PRIORITY_COLORS } from '@/lib/utils';
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface AnalyticsProps {
  stats: any;
}

export default function Analytics({ stats }: AnalyticsProps) {
  if (!stats) return null;

  const priorityData = stats.byPriority || [];
  const findCount = (id: string) => priorityData.find((p: any) => p._id === id)?.count || 0;

  const total = stats.total || 1;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={18} className="text-yellow-500" />
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Analytics</h3>
      </div>

      {/* Weekly Productivity Placeholder */}
      <div className="mb-4">
        <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Priority Distribution</p>
        <div className="space-y-2">
          {['critical', 'high', 'medium', 'low'].map((p) => {
            const count = findCount(p);
            const pct = Math.round((count / total) * 100);
            return (
              <div key={p} className="flex items-center gap-2">
                <span className="w-12 text-xs text-gray-500 capitalize">{p}</span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', PRIORITY_COLORS[p])}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-xs text-gray-500 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category Distribution */}
      {stats.byCategory && stats.byCategory.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">By Category</p>
          <div className="grid grid-cols-2 gap-2">
            {stats.byCategory.slice(0, 6).map((cat: any) => {
              const pct = Math.round((cat.count / total) * 100);
              return (
                <div key={cat._id} className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2.5">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize truncate">{cat._id}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div className="h-full rounded-full bg-yellow-400" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-400">{cat.count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 grid grid-cols-3 gap-3">
        <div className="text-center">
          <TrendingUp size={16} className="mx-auto text-green-500 mb-1" />
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats.completedToday || 0}</p>
          <p className="text-[10px] text-gray-400">Done Today</p>
        </div>
        <div className="text-center">
          <Minus size={16} className="mx-auto text-yellow-500 mb-1" />
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats.total || 0}</p>
          <p className="text-[10px] text-gray-400">Total Tasks</p>
        </div>
        <div className="text-center">
          <TrendingDown size={16} className="mx-auto text-red-500 mb-1" />
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats.overdue || 0}</p>
          <p className="text-[10px] text-gray-400">Overdue</p>
        </div>
      </div>
    </div>
  );
}
