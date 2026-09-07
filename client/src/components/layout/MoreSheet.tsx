import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  CalendarCheck2,
  ListTodo,
  BookmarkPlus,
  Tags,
  Star,
  Flame,
  Bell,
  Timer,
  Users,
  Trash2,
  Settings,
  LogOut,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * Active section id from Sidebar's `sectionFromPath` (passed through, so
   * the matcher is not duplicated here).
   */
  current: string;
  onNavigate: (section: string) => void;
  onSignOut: () => void;
  /** Unread count shown on the Notifications row. */
  unreadCount?: number;
}

interface MoreRow {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
}

// Mirrors the sidebar destinations minus the BottomNav tabs
// (Today/Inbox/Calendar live on the tab bar). Secondary routes
// (Favorites/Insights/Focus) stay reachable here and via the palette,
// so collapsing the sidebar never orphans a feature.
const ROWS: MoreRow[] = [
  { id: 'dashboard', label: 'Dashboard', hint: 'Overview and up next', icon: LayoutDashboard },
  { id: 'weekly-review', label: 'Weekly Reset', hint: 'Calm weekly review', icon: CalendarCheck2 },
  { id: 'all', label: 'All Tasks', hint: 'Every task, filterable', icon: ListTodo },
  { id: 'categories', label: 'Categories', hint: 'Organise by area', icon: Tags },
  { id: 'templates', label: 'Templates', hint: 'Reusable task setups', icon: BookmarkPlus },
  { id: 'favorites', label: 'Favorites', hint: 'Starred tasks', icon: Star },
  { id: 'insights', label: 'Insights', hint: 'Scores and trends', icon: Flame },
  { id: 'focus', label: 'Focus Timer', hint: 'Timed work sessions', icon: Timer },
  { id: 'notifications', label: 'Notifications', hint: 'Reminders and mentions', icon: Bell },
  { id: 'team', label: 'Team', hint: 'People and sharing', icon: Users },
  { id: 'trash', label: 'Trash', hint: 'Restore or purge', icon: Trash2 },
  { id: 'settings', label: 'Settings', hint: 'Preferences and account', icon: Settings },
];

/**
 * Phone-only overflow sheet for the destinations that don't fit the bottom
 * tab bar. Rendered from Sidebar.tsx (`md:hidden` mount) — same constraint
 * as BottomNav: the shell in routes.tsx is owned elsewhere.
 */
export default function MoreSheet({
  open,
  onClose,
  current,
  onNavigate,
  onSignOut,
  unreadCount = 0,
}: MoreSheetProps) {
  // Escape closes; the Modal-style focus trap is intentionally not repeated
  // here — the sheet holds plain buttons and returns focus to the More tab.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-gray-950/45 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="More destinations"
            initial={{ y: 64, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-3xl border-x border-t border-gray-200 bg-card pb-[env(safe-area-inset-bottom)] shadow-xl dark:border-gray-800"
          >
            <div className="sticky top-0 flex items-center justify-between gap-3 bg-card px-5 pt-3 pb-2">
              <p className="font-display text-lg text-gray-900 dark:text-gray-100">More</p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close more destinations"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <ul className="px-3 pb-3">
              {ROWS.map((row) => {
                const Icon = row.icon;
                const isActive = current === row.id;
                const badge = row.id === 'notifications' && unreadCount > 0 ? unreadCount : 0;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate(row.id);
                        onClose();
                      }}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                        isActive
                          ? 'bg-yellow-400/10 text-gray-900 dark:text-gray-50'
                          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                          isActive
                            ? 'bg-yellow-400/20 text-yellow-700 dark:text-yellow-300'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                        )}
                      >
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{row.label}</span>
                        <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                          {row.hint}
                        </span>
                      </span>
                      {badge > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-yellow-400 px-1.5 text-[11px] font-bold text-gray-950">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
              <li className="mt-1 border-t border-hairline pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSignOut();
                  }}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-gray-700 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-200 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    <LogOut size={18} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">Sign out</span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                      End this session
                    </span>
                  </span>
                </button>
              </li>
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
