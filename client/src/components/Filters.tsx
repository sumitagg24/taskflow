import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, X, Bookmark, BookmarkPlus, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Select } from './ui/Input';
import { Button } from './ui/Button';

export interface FiltersValues {
  status: string;
  priority: string;
  sort: string;
  search: string;
  category: string;
  tag: string;
  dueDateBefore: string;
  dueDateAfter: string;
}

export const EMPTY_FILTERS: FiltersValues = {
  status: '',
  priority: '',
  sort: '',
  search: '',
  category: '',
  tag: '',
  dueDateBefore: '',
  dueDateAfter: '',
};

export const SAVED_VIEWS_KEY = 'taskflow:savedViews';

const isoDay = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

/**
 * Dates are sent with an explicit time so a task due "today" at 17:00 still
 * falls inside the day window — the server compares against the stored Date.
 */
const startOf = (day: string) => `${day}T00:00:00`;
const endOf = (day: string) => `${day}T23:59:59`;

interface SmartView {
  id: string;
  label: string;
  patch: Partial<FiltersValues>;
}

/**
 * Smart views are named presets over the same query params the server already
 * validates — no bespoke endpoint, and they compose with the dropdowns below.
 * Built fresh on each render so a tab left open overnight doesn't keep
 * yesterday's date boundaries.
 */
function buildSmartViews(): SmartView[] {
  return [
    {
      id: 'today',
      label: 'Due today',
      patch: { dueDateAfter: startOf(isoDay()), dueDateBefore: endOf(isoDay()), sort: 'dueDate' },
    },
    {
      id: 'overdue',
      label: 'Overdue',
      patch: { dueDateAfter: '', dueDateBefore: endOf(isoDay(-1)), sort: 'dueDate' },
    },
    {
      id: 'week',
      label: 'Next 7 days',
      patch: { dueDateAfter: startOf(isoDay()), dueDateBefore: endOf(isoDay(7)), sort: 'dueDate' },
    },
    {
      id: 'critical',
      label: 'Critical',
      patch: { priority: 'critical', sort: '-priority' },
    },
  ];
}

interface SavedView {
  id: string;
  name: string;
  filters: FiltersValues;
}

function loadSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v) => v && typeof v.name === 'string' && v.filters && typeof v.filters === 'object')
      .map((v, i) => ({ id: String(v.id ?? i), name: v.name, filters: { ...EMPTY_FILTERS, ...v.filters } }));
  } catch {
    return [];
  }
}

const statusOptions = [
  { value: '', label: 'Any status' },
  { value: 'pending', label: 'To Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'review', label: 'Review' },
];

const priorityOptions = [
  { value: '', label: 'Any priority' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const categoryOptions = [
  { value: '', label: 'Any category' },
  ...['work', 'personal', 'college', 'projects', 'fitness', 'shopping', 'finance', 'learning'].map(
    (value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) })
  ),
];

const sortOptions = [
  { value: '', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'dueDate', label: 'Due soonest' },
  { value: '-dueDate', label: 'Due latest' },
  { value: '-priority', label: 'Priority' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'updated', label: 'Recently updated' },
];

/** Human-readable labels for the active-filter chips. */
const CHIP_LABELS: Partial<Record<keyof FiltersValues, (v: string) => string>> = {
  status: (v) => statusOptions.find((o) => o.value === v)?.label ?? v,
  priority: (v) => priorityOptions.find((o) => o.value === v)?.label ?? v,
  category: (v) => categoryOptions.find((o) => o.value === v)?.label ?? v,
  sort: (v) => sortOptions.find((o) => o.value === v)?.label ?? v,
  tag: (v) => `#${v}`,
  dueDateAfter: (v) => `from ${v.slice(0, 10)}`,
  dueDateBefore: (v) => `until ${v.slice(0, 10)}`,
};

interface FiltersProps {
  filters: FiltersValues;
  onChange: React.Dispatch<React.SetStateAction<FiltersValues>>;
}

export default function Filters({ filters, onChange }: FiltersProps) {
  const [savedViews, setSavedViews] = useState<SavedView[]>(loadSavedViews);
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState('');

  // Search is debounced locally: the parent refetches on every filter change,
  // so pushing each keystroke straight up would fire a request per character.
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const pushedSearch = useRef(filters.search);

  useEffect(() => {
    // Only adopt the incoming value when it wasn't us who set it (e.g. the
    // "Clear filters" button in the empty state).
    if (filters.search !== pushedSearch.current) {
      pushedSearch.current = filters.search;
      setSearchDraft(filters.search);
    }
  }, [filters.search]);

  useEffect(() => {
    if (searchDraft === pushedSearch.current) return;
    const t = setTimeout(() => {
      pushedSearch.current = searchDraft;
      onChange((prev) => ({ ...prev, search: searchDraft }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchDraft, onChange]);

  const update = (key: keyof FiltersValues, value: string) =>
    onChange((prev) => ({ ...prev, [key]: value }));

  const clear = useCallback(() => {
    pushedSearch.current = '';
    setSearchDraft('');
    onChange({ ...EMPTY_FILTERS });
  }, [onChange]);

  const smartViews = useMemo(buildSmartViews, []);

  const activeSmart = useMemo(
    () =>
      smartViews.find((view) =>
        Object.entries(view.patch).every(([k, v]) => filters[k as keyof FiltersValues] === v)
      )?.id ?? null,
    [smartViews, filters]
  );

  const toggleSmart = (view: SmartView) => {
    if (activeSmart === view.id) {
      const cleared = Object.fromEntries(Object.keys(view.patch).map((k) => [k, '']));
      onChange((prev) => ({ ...prev, ...cleared }));
      return;
    }
    // Date windows are mutually exclusive, so reset both before applying.
    onChange((prev) => ({ ...prev, dueDateAfter: '', dueDateBefore: '', ...view.patch }));
  };

  const activeChips = (Object.keys(CHIP_LABELS) as (keyof FiltersValues)[])
    .filter((key) => filters[key])
    .map((key) => ({ key, label: CHIP_LABELS[key]!(filters[key]) }));

  const hasFilters = Object.values(filters).some((v) => v !== '');

  const persist = (next: SavedView[]) => {
    setSavedViews(next);
    try {
      localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
    } catch {
      toast.error('Could not save the view on this device');
    }
  };

  const saveCurrentView = () => {
    const name = viewName.trim().slice(0, 40);
    if (!name) return;
    if (savedViews.some((v) => v.name.toLowerCase() === name.toLowerCase())) {
      toast.error('A view with that name already exists');
      return;
    }
    persist([...savedViews, { id: `${Date.now()}`, name, filters: { ...filters } }]);
    setViewName('');
    setNaming(false);
    toast.success(`Saved “${name}”`);
  };

  const applySavedView = (view: SavedView) => {
    pushedSearch.current = view.filters.search;
    setSearchDraft(view.filters.search);
    onChange({ ...EMPTY_FILTERS, ...view.filters });
  };

  const deleteSavedView = (id: string) => persist(savedViews.filter((v) => v.id !== id));

  const isSavedActive = (view: SavedView) =>
    (Object.keys(EMPTY_FILTERS) as (keyof FiltersValues)[]).every(
      (k) => (view.filters[k] || '') === (filters[k] || '')
    );

  return (
    <div className="mb-4 space-y-3">
      {/* Row 1 — search + dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
            size={15}
            aria-hidden="true"
          />
          <label className="sr-only" htmlFor="task-search">Search tasks</label>
          <input
            id="task-search"
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSearchDraft('');
            }}
            placeholder="Search titles and descriptions…"
            className="bg-card h-10 w-full rounded-lg border border-gray-200 pr-9 pl-9 text-sm text-gray-900 outline-none transition-[border-color,box-shadow] placeholder:text-gray-400 focus:border-yellow-400 focus:ring-[3px] focus:ring-yellow-400/15 dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          {searchDraft && (
            <button
              type="button"
              onClick={() => setSearchDraft('')}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200"
              aria-label="Clear search"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        <Select
          aria-label="Filter by status"
          value={filters.status}
          onChange={(e) => update('status', e.target.value)}
          options={statusOptions}
          wrapperClassName="w-auto"
          className="min-w-[130px]"
        />
        <Select
          aria-label="Filter by priority"
          value={filters.priority}
          onChange={(e) => update('priority', e.target.value)}
          options={priorityOptions}
          wrapperClassName="w-auto"
          className="min-w-[130px]"
        />
        <Select
          aria-label="Filter by category"
          value={filters.category}
          onChange={(e) => update('category', e.target.value)}
          options={categoryOptions}
          wrapperClassName="w-auto"
          className="min-w-[130px]"
        />
        <Select
          aria-label="Sort tasks"
          value={filters.sort}
          onChange={(e) => update('sort', e.target.value)}
          options={sortOptions}
          wrapperClassName="w-auto"
          className="min-w-[145px]"
        />
      </div>

      {/* Row 2 — smart views, saved views, save/clear */}
      <div className="flex flex-wrap items-center gap-1.5">
        {smartViews.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => toggleSmart(view)}
            aria-pressed={activeSmart === view.id}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              activeSmart === view.id
                ? 'border-yellow-400 bg-yellow-400/15 text-gray-900 dark:text-gray-100'
                : 'border-hairline hover:bg-card-hover text-gray-600 dark:text-gray-300'
            )}
          >
            {view.label}
          </button>
        ))}

        {savedViews.length > 0 && (
          <span className="border-hairline mx-1 h-4 border-l" aria-hidden="true" />
        )}

        {savedViews.map((view) => {
          const active = isSavedActive(view);
          return (
            <span
              key={view.id}
              className={cn(
                'group inline-flex items-center gap-1 rounded-full border pr-1 pl-2.5 text-xs font-medium transition-colors',
                active
                  ? 'border-yellow-400 bg-yellow-400/15 text-gray-900 dark:text-gray-100'
                  : 'border-hairline text-gray-600 dark:text-gray-300'
              )}
            >
              <button
                type="button"
                onClick={() => applySavedView(view)}
                aria-pressed={active}
                className="flex items-center gap-1.5 py-1"
              >
                <Bookmark size={11} aria-hidden="true" />
                {view.name}
              </button>
              <button
                type="button"
                onClick={() => deleteSavedView(view.id)}
                className="rounded-full p-0.5 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-500"
                aria-label={`Delete saved view “${view.name}”`}
              >
                <X size={11} aria-hidden="true" />
              </button>
            </span>
          );
        })}

        <div className="ml-auto flex items-center gap-1.5">
          {naming ? (
            <div className="flex items-center gap-1.5">
              <label className="sr-only" htmlFor="view-name">Name this view</label>
              <input
                id="view-name"
                autoFocus
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveCurrentView();
                  }
                  if (e.key === 'Escape') {
                    setNaming(false);
                    setViewName('');
                  }
                }}
                placeholder="View name"
                maxLength={40}
                className="bg-card h-8 w-36 rounded-lg border border-gray-200 px-2.5 text-xs text-gray-900 outline-none focus:border-yellow-400 dark:border-gray-700 dark:text-gray-100"
              />
              <Button
                type="button"
                size="sm"
                onClick={saveCurrentView}
                disabled={!viewName.trim()}
                icon={<Check size={12} />}
                aria-label="Save view"
              />
            </div>
          ) : (
            hasFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setNaming(true)}
                icon={<BookmarkPlus size={13} />}
              >
                Save view
              </Button>
            )
          )}

          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clear}
              icon={<X size={13} />}
              aria-label="Clear all filters"
            >
              Clear{activeChips.length ? ` (${activeChips.length})` : ''}
            </Button>
          )}
        </div>
      </div>

      {/* Row 3 — individually removable active filters */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="caption-upper text-gray-400 dark:text-gray-500">Active</span>
          {activeChips.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => update(key, '')}
              className="bg-surface-strong hover:bg-card-hover inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-gray-700 transition-colors dark:text-gray-300"
              aria-label={`Remove filter ${label}`}
            >
              {label}
              <X size={10} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
