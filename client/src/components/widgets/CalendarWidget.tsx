import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface CalendarWidgetProps {
  tasks: any[];
}

export default function CalendarWidget({ tasks }: CalendarWidgetProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  // Derived per-day counts re-run on every parent render without this;
  // the per-task Date parse is the only non-trivial work in this widget.
  const taskCountByDay: Record<number, number> = useMemo(() => {
    const counts: Record<number, number> = {};
    tasks.forEach(task => {
      if (task.dueDate) {
        const d = new Date(task.dueDate);
        if (d.getFullYear() === year && d.getMonth() === month) {
          counts[d.getDate()] = (counts[d.getDate()] || 0) + 1;
        }
      }
    });
    return counts;
  }, [tasks, year, month]);

  const hasDeadlines = Object.keys(taskCountByDay).length > 0;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-yellow-500" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Calendar</h3>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <button onClick={nextMonth} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">{monthName}</p>

      <div className="grid grid-cols-7 gap-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">{d}</div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
          const hasTask = taskCountByDay[day];
          return (
            <motion.button
              key={day}
              whileHover={{ scale: 1.1 }}
              className={cn(
                'relative flex items-center justify-center rounded-lg py-1.5 text-sm transition-all',
                isToday
                  ? 'bg-yellow-400 text-gray-900 font-bold shadow-md shadow-yellow-500/30'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              )}
            >
              {day}
              {hasTask && !isToday && (
                <span className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-yellow-400" />
              )}
              {hasTask && isToday && (
                <span className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-gray-900" />
              )}
            </motion.button>
          );
        })}
      </div>

      {hasDeadlines && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-400">
            {Object.values(taskCountByDay).reduce((a, b) => a + b, 0)} tasks with deadlines this month
          </p>
        </div>
      )}
    </div>
  );
}
