import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRightCircle, BarChart3, BookmarkPlus, Calendar, CheckCircle2, ClipboardList,
  CornerDownLeft, Flame, LayoutDashboard, ListTodo, Moon, Plus, Search, Settings,
  Sparkles, Star, Sun, Tags, Timer, Trash2, Users, Archive, Bell, LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fuzzyFilter, highlightChunks, type FuzzyResult } from '@/lib/fuzzy';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { Kbd, PriorityDot, STATUS_LABELS } from '@/components/ui';

export interface PaletteTask {
  _id: string;
  title: string;
  status: string;
  priority?: string;
  category?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: PaletteTask[];
  onNavigate: (section: string) => void;
  onOpenTask: (id: string) => void;
  onNewTask: () => void;
  onOpenAIAssistant?: () => void;
}

type Command = {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  group: 'Navigate' | 'Actions';
  keywords?: string;
  run: () => void;
};

const RECENT_KEY = 'taskflow:palette-recent';
const MAX_RECENT = 5;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export default function CommandPalette({
  isOpen,
  onClose,
  tasks,
  onNavigate,
  onOpenTask,
  onNewTask,
  onOpenAIAssistant,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { logout } = useAuth();

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setRecent(readRecent());
    }
  }, [isOpen]);

  const go = useCallback(
    (section: string) => () => {
      onNavigate(section);
      onClose();
    },
    [onNavigate, onClose]
  );

  const commands = useMemo<Command[]>(() => {
    const nav: [string, string, ReactNode][] = [
      ['dashboard', 'Dashboard', <LayoutDashboard size={15} key="i" />],
      ['all', 'All Tasks', <ListTodo size={15} key="i" />],
      ['pending', 'To Do', <ClipboardList size={15} key="i" />],
      ['in-progress', 'In Progress', <ArrowRightCircle size={15} key="i" />],
      ['completed', 'Completed', <CheckCircle2 size={15} key="i" />],
      ['backlog', 'Backlog', <Archive size={15} key="i" />],
      ['calendar', 'Calendar', <Calendar size={15} key="i" />],
      ['favorites', 'Favorites', <Star size={15} key="i" />],
      ['categories', 'Categories', <Tags size={15} key="i" />],
      ['templates', 'Templates', <BookmarkPlus size={15} key="i" />],
      ['insights', 'Insights', <Flame size={15} key="i" />],
      ['analytics', 'Analytics', <BarChart3 size={15} key="i" />],
      ['focus', 'Focus Timer', <Timer size={15} key="i" />],
      ['notifications', 'Notifications', <Bell size={15} key="i" />],
      ['team', 'Team', <Users size={15} key="i" />],
      ['trash', 'Trash', <Trash2 size={15} key="i" />],
      ['settings', 'Settings', <Settings size={15} key="i" />],
    ];

    const list: Command[] = nav.map(([id, label, icon]) => ({
      id: `nav:${id}`,
      label,
      icon,
      group: 'Navigate',
      keywords: `go to ${label}`,
      run: go(id),
    }));

    list.push({
      id: 'action:new-task',
      label: 'Create new task',
      hint: 'N',
      icon: <Plus size={15} />,
      group: 'Actions',
      keywords: 'add create new task',
      run: () => {
        onClose();
        onNewTask();
      },
    });

    if (onOpenAIAssistant) {
      list.push({
        id: 'action:ai',
        label: 'Ask AI assistant',
        icon: <Sparkles size={15} />,
        group: 'Actions',
        keywords: 'ai assistant chat help',
        run: () => {
          onClose();
          onOpenAIAssistant();
        },
      });
    }

    list.push({
      id: 'action:theme',
      label: resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
      icon: resolvedTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />,
      group: 'Actions',
      keywords: 'theme dark light appearance toggle',
      run: () => {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
        onClose();
      },
    });

    if (theme !== 'system') {
      list.push({
        id: 'action:theme-system',
        label: 'Use system theme',
        icon: <Sun size={15} />,
        group: 'Actions',
        keywords: 'theme system auto appearance',
        run: () => {
          setTheme('system');
          onClose();
        },
      });
    }

    list.push({
      id: 'action:logout',
      label: 'Sign out',
      icon: <LogOut size={15} />,
      group: 'Actions',
      keywords: 'log out sign out exit',
      run: () => {
        onClose();
        logout();
      },
    });

    return list;
  }, [go, logout, onClose, onNewTask, onOpenAIAssistant, resolvedTheme, setTheme, theme]);

  type Row =
    | { kind: 'header'; label: string }
    | { kind: 'command'; command: Command; result: FuzzyResult }
    | { kind: 'task'; task: PaletteTask; result: FuzzyResult };

  const rows = useMemo<Row[]>(() => {
    const trimmed = query.trim();
    const out: Row[] = [];

    if (!trimmed) {
      const recentTasks = recent
        .map((id) => tasks.find((t) => t._id === id))
        .filter((t): t is PaletteTask => !!t);

      if (recentTasks.length > 0) {
        out.push({ kind: 'header', label: 'Recent' });
        for (const task of recentTasks) {
          out.push({ kind: 'task', task, result: { score: 0, ranges: [] } });
        }
      }
      out.push({ kind: 'header', label: 'Navigate' });
      for (const c of commands.filter((c) => c.group === 'Navigate').slice(0, 6)) {
        out.push({ kind: 'command', command: c, result: { score: 0, ranges: [] } });
      }
      out.push({ kind: 'header', label: 'Actions' });
      for (const c of commands.filter((c) => c.group === 'Actions')) {
        out.push({ kind: 'command', command: c, result: { score: 0, ranges: [] } });
      }
      return out;
    }

    const matchedTasks = fuzzyFilter(tasks, trimmed, (t) => t.title, 8);
    const matchedCommands = fuzzyFilter(
      commands,
      trimmed,
      (c) => `${c.label} ${c.keywords ?? ''}`,
      10
    );

    if (matchedTasks.length > 0) {
      out.push({ kind: 'header', label: 'Tasks' });
      for (const { item, result } of matchedTasks) out.push({ kind: 'task', task: item, result });
    }

    const navMatches = matchedCommands.filter(({ item }) => item.group === 'Navigate');
    const actionMatches = matchedCommands.filter(({ item }) => item.group === 'Actions');

    if (navMatches.length > 0) {
      out.push({ kind: 'header', label: 'Navigate' });
      for (const { item, result } of navMatches) out.push({ kind: 'command', command: item, result });
    }
    if (actionMatches.length > 0) {
      out.push({ kind: 'header', label: 'Actions' });
      for (const { item, result } of actionMatches)
        out.push({ kind: 'command', command: item, result });
    }
    return out;
  }, [commands, query, recent, tasks]);

  const selectable = useMemo(() => rows.filter((r) => r.kind !== 'header'), [rows]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const runRow = useCallback(
    (row: Row) => {
      if (row.kind === 'command') {
        row.command.run();
      } else if (row.kind === 'task') {
        const next = [row.task._id, ...readRecent().filter((id) => id !== row.task._id)].slice(
          0,
          MAX_RECENT
        );
        try {
          localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        } catch {
          /* storage disabled — recents are a nicety, not a requirement */
        }
        onClose();
        onOpenTask(row.task._id);
      }
    },
    [onClose, onOpenTask]
  );

  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
        e.preventDefault();
        setActiveIndex((i) => (selectable.length ? (i + 1) % selectable.length : 0));
        return;
      }
      if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
        e.preventDefault();
        setActiveIndex((i) =>
          selectable.length ? (i - 1 + selectable.length) % selectable.length : 0
        );
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const row = selectable[activeIndex];
        if (row) runRow(row);
      }
    };

    document.addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prev;
      cancelAnimationFrame(raf);
    };
  }, [isOpen, activeIndex, selectable, runRow, onClose]);

  // Keep the highlighted row inside the scroll viewport during keyboard nav.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, rows]);

  let cursor = -1;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-gray-950/45 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex max-h-[62vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-card shadow-2xl dark:border-gray-700"
          >
            <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-4 dark:border-gray-800">
              <Search size={17} className="shrink-0 text-gray-400" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks, jump to a view, run an action…"
                aria-label="Search tasks and commands"
                autoComplete="off"
                spellCheck={false}
                className="h-14 flex-1 bg-transparent text-[15px] text-gray-900 placeholder-gray-400 outline-none dark:text-gray-100 dark:placeholder-gray-500"
              />
              <Kbd className="shrink-0">Esc</Kbd>
            </div>

            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
              {selectable.length === 0 ? (
                <div className="px-3 py-10 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No matches for “{query.trim()}”
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNewTask();
                    }}
                    className="mt-3 text-sm font-medium text-yellow-700 hover:underline dark:text-yellow-400"
                  >
                    Create “{query.trim()}” as a new task
                  </button>
                </div>
              ) : (
                rows.map((row, i) => {
                  if (row.kind === 'header') {
                    return (
                      <p key={`h-${row.label}-${i}`} className="caption-upper mt-3 mb-1 px-3 first:mt-1">
                        {row.label}
                      </p>
                    );
                  }

                  cursor += 1;
                  const isActive = cursor === activeIndex;
                  const index = cursor;

                  if (row.kind === 'task') {
                    const chunks = highlightChunks(row.task.title, row.result.ranges);
                    return (
                      <button
                        key={`t-${row.task._id}`}
                        type="button"
                        data-active={isActive}
                        onMouseMove={() => setActiveIndex(index)}
                        onClick={() => runRow(row)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                          isActive ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                        )}
                      >
                        <PriorityDot priority={row.task.priority || 'none'} />
                        <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-100">
                          {chunks.map((c, ci) =>
                            c.match ? (
                              <mark
                                key={ci}
                                className="bg-transparent font-semibold text-yellow-700 dark:text-yellow-400"
                              >
                                {c.text}
                              </mark>
                            ) : (
                              <span key={ci}>{c.text}</span>
                            )
                          )}
                        </span>
                        <span className="shrink-0 text-[11px] text-gray-400">
                          {STATUS_LABELS[row.task.status] ?? row.task.status}
                        </span>
                        {isActive && (
                          <CornerDownLeft size={13} className="shrink-0 text-gray-400" aria-hidden="true" />
                        )}
                      </button>
                    );
                  }

                  const chunks = highlightChunks(row.command.label, row.result.ranges);
                  return (
                    <button
                      key={`c-${row.command.id}`}
                      type="button"
                      data-active={isActive}
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => runRow(row)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        isActive ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                      )}
                    >
                      <span className="shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true">
                        {row.command.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-100">
                        {chunks.map((c, ci) =>
                          c.match ? (
                            <mark
                              key={ci}
                              className="bg-transparent font-semibold text-yellow-700 dark:text-yellow-400"
                            >
                              {c.text}
                            </mark>
                          ) : (
                            <span key={ci}>{c.text}</span>
                          )
                        )}
                      </span>
                      {row.command.hint && <Kbd className="shrink-0">{row.command.hint}</Kbd>}
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex shrink-0 items-center gap-4 border-t border-gray-100 px-4 py-2.5 text-[11px] text-gray-500 dark:border-gray-800 dark:text-gray-500">
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                navigate
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd>
                open
              </span>
              <span className="ml-auto hidden sm:inline">
                {selectable.length} result{selectable.length === 1 ? '' : 's'}
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
