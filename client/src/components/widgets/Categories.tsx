import { cn, CATEGORY_CONFIG } from '@/lib/utils';
import { Tags } from 'lucide-react';

interface CategoriesProps {
  tasks: any[];
}

export default function Categories({ tasks }: CategoriesProps) {
  const taskCategories: Record<string, any[]> = {};
  tasks.forEach(t => {
    const cat = t.category || 'uncategorized';
    if (!taskCategories[cat]) taskCategories[cat] = [];
    taskCategories[cat].push(t);
  });

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Tags size={18} className="text-yellow-500" />
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Categories</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {CATEGORY_CONFIG.map((cat) => {
          const tasksInCat = taskCategories[cat.id] || [];
          const total = tasksInCat.length;
          const completed = tasksInCat.filter(t => t.status === 'completed').length;
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
          const Icon = cat.icon;

          return (
            <div
              key={cat.id}
              className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={cn('rounded-lg p-1.5', cat.color.replace('bg-', 'bg-').replace('500', '100 dark:bg-opacity-20'))}>
                  <Icon size={14} className="text-white" />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cat.label}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{completed}/{total} done</span>
                <span className={cn('font-medium', pct === 100 ? 'text-green-500' : 'text-gray-500')}>{pct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', cat.color)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
