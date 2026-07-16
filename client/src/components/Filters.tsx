import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FiltersValues {
  status: string;
  priority: string;
  sort: string;
  search: string;
  category: string;
  tag: string;
}

interface FiltersProps {
  filters: FiltersValues;
  onChange: React.Dispatch<React.SetStateAction<FiltersValues>>;
}

export default function Filters({ filters, onChange }: FiltersProps) {
  const update = (key: keyof FiltersValues, value: string) =>
    onChange(prev => ({ ...prev, [key]: value }));

  const clear = () => {
    onChange({ status: '', priority: '', sort: '', search: '', category: '', tag: '' });
  };

  const hasFilters = filters.status || filters.priority || filters.sort || filters.search || filters.category || filters.tag;
  const filterCount = [filters.status, filters.priority, filters.sort, filters.category, filters.tag].filter(Boolean).length;

  return (
    <div className="flex flex-wrap items-center gap-2.5 mb-4">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
        <input
          className="input-field pl-9 pr-3"
          placeholder="Search tasks..."
          value={filters.search}
          onChange={(e) => update('search', e.target.value)}
        />
      </div>

      {/* Status */}
      <select
        value={filters.status}
        onChange={(e) => update('status', e.target.value)}
        className="input-field w-auto min-w-[120px]"
      >
        <option value="">All Status</option>
        <option value="pending">To Do</option>
        <option value="in-progress">In Progress</option>
        <option value="completed">Completed</option>
        <option value="backlog">Backlog</option>
        <option value="blocked">Blocked</option>
        <option value="review">Review</option>
      </select>

      {/* Priority */}
      <select
        value={filters.priority}
        onChange={(e) => update('priority', e.target.value)}
        className="input-field w-auto min-w-[120px]"
      >
        <option value="">All Priority</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      {/* Sort */}
      <select
        value={filters.sort}
        onChange={(e) => update('sort', e.target.value)}
        className="input-field w-auto min-w-[140px]"
      >
        <option value="">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="dueDate">Due Date ↑</option>
        <option value="-dueDate">Due Date ↓</option>
        <option value="-priority">Priority ↓</option>
        <option value="title">Title A-Z</option>
      </select>

      {/* Category */}
      <select
        value={filters.category}
        onChange={(e) => update('category', e.target.value)}
        className="input-field w-auto min-w-[120px]"
      >
        <option value="">All Categories</option>
        <option value="work">Work</option>
        <option value="personal">Personal</option>
        <option value="college">College</option>
        <option value="projects">Projects</option>
        <option value="fitness">Fitness</option>
        <option value="shopping">Shopping</option>
        <option value="finance">Finance</option>
        <option value="learning">Learning</option>
      </select>

      {/* Clear */}
      {hasFilters && (
        <button
          onClick={clear}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X size={14} />
          Clear ({filterCount})
        </button>
      )}
    </div>
  );
}
