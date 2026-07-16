import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { getTasks, toggleFavorite } from '@/api/tasks';
import { toast } from 'sonner';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import KanbanBoard from '@/components/KanbanBoard';
import { Star, Heart, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

export default function FavoritesPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => { loadFavorites(); }, []);

  const loadFavorites = async () => {
    setLoadError(false);
    try {
      const { data } = await getTasks({ isFavorite: 'true' });
      setTasks(data);
    } catch {
      setLoadError(true);
      toast.error('Failed to load favorites');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFavorite = async (task: any) => {
    try {
      await toggleFavorite(task._id);
      setTasks(prev => prev.filter(t => t._id !== task._id));
      toast.success('Removed from favorites');
    } catch {
      toast.error('Failed to update');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 lg:p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <Star size={24} className="text-yellow-500 fill-yellow-500" />
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Favorites</h2>
          <p className="text-sm text-gray-400">{tasks.length} favorited tasks</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-yellow-500" />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <AlertCircle size={40} className="text-red-400" />
          <p className="text-gray-500 dark:text-gray-400">Failed to load favorites</p>
          <button
            onClick={loadFavorites}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-400 text-gray-900 text-sm font-medium hover:bg-yellow-500 transition-colors"
          >
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      ) : tasks.length === 0 ? (
        <div className="card p-12 text-center">
          <Heart size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No favorite tasks yet</p>
          <p className="text-sm text-gray-400 mt-1">Star tasks from the Kanban board to see them here</p>
        </div>
      ) : (
        <>
          {/* Compact list view */}
          <div className="card p-4 mb-4">
            <div className="space-y-1">
              {tasks.map(task => (
                <div
                  key={task._id}
                  className="flex items-center gap-3 rounded-xl p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
                >
                  <button
                    onClick={() => handleToggleFavorite(task)}
                    className="text-yellow-500 hover:text-yellow-600 transition-colors"
                    title="Remove from favorites"
                  >
                    <Star size={16} className="fill-yellow-500" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {task.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={task.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Kanban view */}
          <KanbanBoard
            tasks={tasks}
            onRefresh={loadFavorites}
            onEdit={() => {}}
          />
        </>
      )}
    </motion.div>
  );
}
