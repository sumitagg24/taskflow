import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn, CATEGORY_CONFIG } from '@/lib/utils';
import { getTasks } from '@/api/tasks';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import {
  Tags, Search, ArrowRight, Loader2,
} from 'lucide-react';

export default function CategoriesPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { loadTasks(); }, []);

  const loadTasks = async () => {
    try {
      const { data } = await getTasks({});
      setTasks(data);
    } catch {}
    setLoading(false);
  };

  const taskCategories: Record<string, any[]> = {};
  tasks.forEach(t => {
    const cat = t.category || 'uncategorized';
    if (!taskCategories[cat]) taskCategories[cat] = [];
    taskCategories[cat].push(t);
  });

  const filteredTasks = selectedCat
    ? (taskCategories[selectedCat] || []).filter(t =>
        searchQuery ? t.title.toLowerCase().includes(searchQuery.toLowerCase()) : true
      )
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 lg:p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <Tags size={24} className="text-yellow-500" />
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Categories</h2>
          <p className="text-sm text-gray-400">{tasks.length} total tasks</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {CATEGORY_CONFIG.map(cat => {
          const count = taskCategories[cat.id]?.length || 0;
          const completed = taskCategories[cat.id]?.filter(t => t.status === 'completed').length || 0;
          const pct = count > 0 ? Math.round((completed / count) * 100) : 0;
          const Icon = cat.icon;
          const isSelected = selectedCat === cat.id;

          return (
            <motion.button
              key={cat.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedCat(isSelected ? null : cat.id)}
              className={cn(
                'card p-4 text-left transition-all',
                isSelected && 'ring-2 ring-yellow-400'
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={cn('rounded-xl p-2.5', cat.color)}>
                  <Icon size={18} className="text-white" />
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{cat.label}</span>
              </div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-gray-400">{count} tasks</span>
                <span className={cn('font-medium', pct === 100 ? 'text-green-500' : 'text-gray-500')}>{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-500', cat.color)} style={{ width: `${pct}%` }} />
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Selected category tasks */}
      {selectedCat && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 capitalize">
              {selectedCat} — {filteredTasks.length} tasks
            </h3>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filter..."
                className="input-field pl-9 py-1.5 text-sm w-48"
              />
            </div>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">No tasks in this category</div>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map(task => (
                <div
                  key={task._id}
                  className="flex items-center gap-3 rounded-xl p-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className={cn(
                    'h-2.5 w-2.5 rounded-full shrink-0',
                    task.priority === 'critical' ? 'bg-red-500' :
                    task.priority === 'high' ? 'bg-orange-500' :
                    task.priority === 'medium' ? 'bg-yellow-500' : 'bg-gray-300 dark:bg-gray-600'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-sm font-medium',
                      task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'
                    )}>
                      {task.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={task.status} />
                    <PriorityBadge priority={task.priority} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
