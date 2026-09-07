import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { reportCreateError } from '@/lib/planLimit';
import { getTasks, toTaskArray, createTask, calendarAPI } from '@/api/tasks';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { toast } from 'sonner';
import { PHONE_QUERY } from '@/hooks/useMediaQuery';
import {
  ChevronLeft, ChevronRight, Calendar, Plus,
  ListTodo, Clock, MoreHorizontal, Download,
  ExternalLink, CalendarPlus, Loader2, AlertCircle, RefreshCw,
} from 'lucide-react';

/** Minimal shape of a task as this page uses it (typed; no `any` below). */
interface CalendarTask {
  _id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  dueDate?: string;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Phones open directly on today's agenda (the selected-day panel below)
  // instead of a bare month grid; desktop keeps the previous null default.
  const [selectedDay, setSelectedDay] = useState<number | null>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
    if (!window.matchMedia(PHONE_QUERY).matches) return null;
    return new Date().getDate();
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const fetchTasks = useCallback(async () => {
    setLoadError(false);
    try {
      const { data } = await getTasks({});
      setTasks(toTaskArray(data));
    } catch {
      setLoadError(true);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = new Date();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  // Same grouping cost as the widget, plus per-cell filtering below reads it
  // on every render — memoize on the actual inputs.
  const tasksByDay: Record<number, CalendarTask[]> = useMemo(() => {
    const map: Record<number, CalendarTask[]> = {};
    tasks.forEach(task => {
      if (task.dueDate) {
        const d = new Date(task.dueDate);
        if (d.getFullYear() === year && d.getMonth() === month) {
          const day = d.getDate();
          if (!map[day]) map[day] = [];
          map[day].push(task);
        }
      }
    });
    return map;
  }, [tasks, year, month]);

  const selectedTasks = selectedDay ? tasksByDay[selectedDay] || [] : [];

  const handleQuickAdd = async () => {
    if (!newTitle.trim() || !selectedDay) return;
    const dueDate = new Date(year, month, selectedDay, 23, 59, 59);
    try {
      const { data } = await createTask({
        title: newTitle.trim(),
        dueDate: dueDate.toISOString(),
        status: 'pending',
      });
      setTasks(prev => [data, ...prev]);
      toast.success('Task created');
      setNewTitle('');
      setShowAddModal(false);
    } catch (err) {
      reportCreateError(err);
    }
  };

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const prevMonthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const nextMonthName = new Date(year, month + 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const todayLong = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const monthTaskCount = Object.values(tasksByDay).reduce((n, list) => n + list.length, 0);

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
        <p className="text-gray-500 dark:text-gray-400">Failed to load calendar</p>
        <button
          onClick={fetchTasks}
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
      className="p-4 pb-24 md:p-6"
    >
      {/* Screen-reader agenda summary: month controls below only announce
          their own target, so the date + counts live here in a live region. */}
      <p className="sr-only" role="status">
        {monthName}: {monthTaskCount} dated {monthTaskCount === 1 ? 'task' : 'tasks'}
        {selectedDay ? `, ${selectedTasks.length} on day ${selectedDay}` : ''}
      </p>
      <PageHeader
        eyebrow="Plan"
        title="Calendar"
        count={monthTaskCount}
        subtitle="Manage tasks by due date"
        primary={
          <a
            href={calendarAPI.exportUrl()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-yellow-400 px-3 text-xs font-medium text-gray-950 transition-colors hover:bg-clay-hover"
            title="Download all tasks as an iCalendar (.ics) file"
          >
            <Download size={14} aria-hidden="true" />
            Export .ics
          </a>
        }
        secondary={
          <button
            onClick={goToday}
            aria-label={`Go to today, ${todayLong}`}
            className="inline-flex h-8 items-center rounded-md border border-gray-200 px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Today
          </button>
        }
      />
      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {monthName}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              aria-label={`Previous month, ${prevMonthName}`}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              onClick={nextMonth}
              aria-label={`Next month, ${nextMonthName}`}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {monthName}
        </p>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            const isSelected = day === selectedDay;
            const dayTasks = tasksByDay[day] || [];
            const overdueCount = dayTasks.filter(t => {
              if (t.status === 'completed' || !t.dueDate) return false;
              const d = new Date(t.dueDate);
              return d < new Date() && d.toDateString() !== today.toDateString();
            }).length;

            return (
              <button
                key={day}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                aria-label={`${monthName} ${day}: ${dayTasks.length} ${dayTasks.length === 1 ? 'task' : 'tasks'}`}
                className={cn(
                  'relative flex flex-col items-center rounded-xl p-2 min-h-[80px] transition-all text-left',
                  isToday
                    ? 'bg-yellow-400/10 ring-2 ring-yellow-400'
                    : isSelected
                      ? 'bg-gray-100 dark:bg-gray-800'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                )}
              >
                <span className={cn(
                  'text-sm font-medium mb-1',
                  isToday ? 'text-yellow-600 dark:text-yellow-400 font-bold' : 'text-gray-700 dark:text-gray-300'
                )}>
                  {day}
                </span>
                <div className="flex-1 w-full space-y-0.5">
                  {dayTasks.slice(0, 3).map(task => (
                    <div
                      key={task._id}
                      aria-hidden="true"
                      className={cn(
                        'h-1.5 rounded-full',
                        task.status === 'completed' ? 'bg-green-400' :
                        overdueCount > 0 ? 'bg-red-400' :
                        task.priority === 'critical' || task.priority === 'high' ? 'bg-orange-400' :
                        'bg-blue-400'
                      )}
                    />
                  ))}
                  {/* Phone cells show real titles (not just dots) where space
                      allows: two truncated lines, then a +n overflow. The
                      desktop dots above stay exactly as they were. */}
                  {dayTasks.slice(0, 2).map(task => (
                    <p
                      key={`title-${task._id}`}
                      className="truncate text-[10px] leading-tight text-gray-600 md:hidden dark:text-gray-300"
                    >
                      {task.title}
                    </p>
                  ))}
                  {dayTasks.length > 2 && (
                    <span className="text-[10px] text-gray-400 md:hidden">+{dayTasks.length - 2}</span>
                  )}
                </div>
                {dayTasks.length > 3 && (
                  <span className="text-[10px] text-gray-400 mt-0.5 hidden md:inline">+{dayTasks.length - 3}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day tasks */}
      {selectedDay && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5 mt-4"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ListTodo size={18} className="text-yellow-500" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                Tasks for {new Date(year, month, selectedDay).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </h3>
              <span className="text-sm text-gray-400">({selectedTasks.length})</span>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              <Plus size={14} />
              Add Task
            </button>
          </div>

          {selectedTasks.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-400">No tasks due this day</p>
              <button onClick={() => setShowAddModal(true)} className="mt-2 text-sm text-yellow-600 dark:text-yellow-400 hover:underline">
                Create one
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedTasks.map(task => (
                <TaskCalendarRow key={task._id} task={task} />
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Quick Add Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Quick Add Task" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Add task for {selectedDay ? new Date(year, month, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''}
          </p>
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="What needs to be done?"
            className="input-field"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddModal(false)} className="btn-ghost px-3 py-1.5 text-sm">Cancel</button>
            <button onClick={handleQuickAdd} className="btn-primary px-3 py-1.5 text-sm">Add</button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}

// Per-task row with Google / Outlook / Apple "add to calendar" links.
// Links are fetched lazily when the user clicks the calendar icon.
function TaskCalendarRow({ task }: { task: CalendarTask }) {
  const [links, setLinks] = useState<{ google?: string; outlook?: string; apple?: string } | null>(null);

  const openLinks = async () => {
    if (links) return;
    try {
      const { data } = await calendarAPI.getLinks(task._id);
      setLinks(data);
    } catch {
      // Optional — silently ignore.
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-xl p-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
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
        {task.description && (
          <p className="text-xs text-gray-400 truncate">{task.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority ?? 'none'} />
        <button
          onClick={openLinks}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="Add to calendar"
        >
          <CalendarPlus size={14} />
        </button>
        {links?.google && (
          <a href={links.google} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5">
            Google <ExternalLink size={10} />
          </a>
        )}
        {links?.outlook && (
          <a href={links.outlook} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5">
            Outlook <ExternalLink size={10} />
          </a>
        )}
        {links?.apple && (
          <a href={links.apple} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5">
            Apple <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}
