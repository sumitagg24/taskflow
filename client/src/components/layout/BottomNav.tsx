import { CalendarDays, House, Inbox, Search, Ellipsis } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BottomNavProps {
  /**
   * Active section id as resolved by Sidebar's `sectionFromPath` matcher —
   * BottomNav takes it as a prop so the URL→section logic lives in exactly
   * one place (Sidebar) and is never duplicated here.
   */
  current: string;
  /** Section ids use the same vocabulary as Sidebar (`dashboard`, `all`, …). */
  onNavigate: (section: string) => void;
  /** Opens the command palette (wired by Sidebar to the shell). */
  onOpenPalette: () => void;
  /** Opens the More sheet. */
  onMore: () => void;
  /** True while the More sheet is open — keeps its tab highlighted. */
  moreOpen?: boolean;
  /** Unread notification count, shown as a dot on the More tab. */
  moreBadge?: number;
}

const LIST_SECTIONS = ['all', 'pending', 'in-progress', 'completed', 'backlog'];

/**
 * Phone-only bottom tab bar (`md:hidden`). Rendered from Sidebar.tsx — the
 * shell (`routes.tsx`) is owned by another worker, so Sidebar is the only
 * mount point available without touching the router.
 *
 * KNOWN ISSUE (shell owner): the shell renders a `fixed right-5 bottom-5
 * md:hidden` create-task FAB that now sits on top of this bar. It needs to
 * move above the bar (`bottom-[calc(4.5rem+env(safe-area-inset-bottom))]`)
 * or into the bar itself — see the commit message.
 */
export default function BottomNav({
  current,
  onNavigate,
  onOpenPalette,
  onMore,
  moreOpen = false,
  moreBadge = 0,
}: BottomNavProps) {
  const inboxActive = LIST_SECTIONS.includes(current);

  const tabClass = (active: boolean) =>
    cn(
      'flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-colors',
      active
        ? 'text-yellow-700 dark:text-yellow-300'
        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
    );

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="flex items-stretch gap-1 px-2 pt-1.5">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          aria-current={current === 'dashboard' ? 'page' : undefined}
          aria-label="Today"
          className={tabClass(current === 'dashboard')}
        >
          <House size={21} aria-hidden="true" />
          Today
        </button>
        <button
          type="button"
          onClick={() => onNavigate('all')}
          aria-current={inboxActive ? 'page' : undefined}
          aria-label="Inbox"
          className={tabClass(inboxActive)}
        >
          <Inbox size={21} aria-hidden="true" />
          Inbox
        </button>
        <button
          type="button"
          onClick={() => onNavigate('calendar')}
          aria-current={current === 'calendar' ? 'page' : undefined}
          aria-label="Plan"
          className={tabClass(current === 'calendar')}
        >
          <CalendarDays size={21} aria-hidden="true" />
          Plan
        </button>
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="Search tasks and commands"
          className={tabClass(false)}
        >
          <Search size={21} aria-hidden="true" />
          Search
        </button>
        <button
          type="button"
          onClick={onMore}
          aria-label="More destinations"
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          className={cn(tabClass(moreOpen), 'relative')}
        >
          <Ellipsis size={21} aria-hidden="true" />
          More
          {moreBadge > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1/2 translate-x-4 h-2 w-2 rounded-full bg-yellow-400"
            />
          )}
        </button>
      </div>
    </nav>
  );
}
