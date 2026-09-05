import { useAuth } from '@/context/AuthContext';
import { Search, Plus, Sparkles, Settings, LogOut, User, ChevronDown, Bell } from 'lucide-react';
import { useNotifications } from '@/context/NotificationContext';
import { Avatar, Button, DropdownMenu, KbdShortcut, ThemeToggle, Tooltip } from '@/components/ui';

interface NavbarProps {
  onNewTask: () => void;
  onOpenCommandPalette: () => void;
  onOpenAIAssistant?: () => void;
  onNavigate?: (section: string) => void;
  activeSection?: string;
}

const SECTION_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  all: 'All Tasks',
  pending: 'To Do',
  'in-progress': 'In Progress',
  completed: 'Completed',
  backlog: 'Backlog',
  calendar: 'Calendar',
  favorites: 'Favorites',
  categories: 'Categories',
  templates: 'Templates',
  insights: 'Insights',
  analytics: 'Analytics',
  focus: 'Focus Timer',
  notifications: 'Notifications',
  team: 'Team',
  trash: 'Trash',
  settings: 'Settings',
};

export default function Navbar({
  onNewTask,
  onOpenCommandPalette,
  onOpenAIAssistant,
  onNavigate,
  activeSection = 'dashboard',
}: NavbarProps) {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();

  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header
      className="sticky top-0 z-30 border-b border-hairline backdrop-blur-xl"
      style={{ backgroundColor: 'color-mix(in srgb, var(--bg-primary) 82%, transparent)' }}
    >
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
        <div className="hidden min-w-0 sm:block">
          <h1 className="font-display truncate text-[19px] leading-tight text-gray-900 dark:text-gray-50">
            {SECTION_TITLES[activeSection] ?? 'Workspace'}
          </h1>
          <p className="truncate text-xs text-gray-500 dark:text-gray-500">{dateStr}</p>
        </div>

        {/* Search is a palette trigger, not an input: one search surface beats two.
            min-w-0 + flex-1 (NOT w-full) so the button shrinks inside the row
            instead of shoving the controls off-screen on narrow phones. */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="mx-auto flex h-9 min-w-0 flex-1 max-w-md items-center gap-2.5 rounded-lg border border-gray-200 bg-card px-3 text-left text-sm text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
        >
          <Search size={15} className="shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate">Search tasks or jump to…</span>
          <KbdShortcut keys={['mod', 'K']} className="hidden sm:inline-flex" />
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {onOpenAIAssistant && (
            <Tooltip content="Ask AI">
              <button
                type="button"
                onClick={onOpenAIAssistant}
                aria-label="Ask AI"
                className="hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-50 sm:flex dark:text-purple-300 dark:hover:bg-purple-500/12"
              >
                <Sparkles size={16} aria-hidden="true" />
                <span className="hidden lg:inline">Ask AI</span>
              </button>
            </Tooltip>
          )}

          <Tooltip content={unreadCount > 0 ? `${unreadCount} unread` : 'Notifications'}>
            <button
              type="button"
              onClick={() => onNavigate?.('notifications')}
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
              className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              <Bell size={17} aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-yellow-400 ring-2 ring-[var(--bg-primary)]" />
              )}
            </button>
          </Tooltip>

          <ThemeToggle />

          <Button size="sm" icon={<Plus size={15} />} onClick={onNewTask} className="ml-1 h-9 px-3">
            <span className="hidden sm:inline">New Task</span>
          </Button>

          <DropdownMenu
            align="end"
            items={[
              {
                id: 'profile',
                label: 'Profile',
                icon: <User size={15} />,
                onSelect: () => onNavigate?.('settings'),
              },
              {
                id: 'settings',
                label: 'Settings',
                icon: <Settings size={15} />,
                onSelect: () => onNavigate?.('settings'),
              },
              {
                id: 'logout',
                label: 'Sign out',
                icon: <LogOut size={15} />,
                danger: true,
                separatorBefore: true,
                onSelect: logout,
              },
            ]}
            trigger={
              <button
                type="button"
                aria-label="Account menu"
                className="ml-0.5 flex items-center gap-1 rounded-lg p-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <Avatar name={user?.name} size="sm" />
                <ChevronDown size={13} className="hidden text-gray-400 sm:block" aria-hidden="true" />
              </button>
            }
          />
        </div>
      </div>
    </header>
  );
}
