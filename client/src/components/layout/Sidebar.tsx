import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { Avatar, Logo, LogoMark, Tooltip } from '@/components/ui';
import {
  LayoutDashboard, ListTodo, ClipboardList, ArrowRightCircle,
  CheckCircle2, Archive, Calendar, Tags, BarChart3, Timer,
  Bell, Settings, PanelLeftClose, PanelLeftOpen,
  LogOut, Menu, X, Star, Users, BookmarkPlus, Trash2, Flame,
} from 'lucide-react';

interface SidebarProps {
  activeSection: string;
  onNavigate: (section: string) => void;
}

type NavEntry =
  | { type: 'section'; label: string }
  | { type: 'item'; id: string; label: string; icon: typeof LayoutDashboard };

const navItems: NavEntry[] = [
  { type: 'item', id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { type: 'item', id: 'all', label: 'All Tasks', icon: ListTodo },
  { type: 'section', label: 'Workflow' },
  { type: 'item', id: 'pending', label: 'To Do', icon: ClipboardList },
  { type: 'item', id: 'in-progress', label: 'In Progress', icon: ArrowRightCircle },
  { type: 'item', id: 'completed', label: 'Completed', icon: CheckCircle2 },
  { type: 'item', id: 'backlog', label: 'Backlog', icon: Archive },
  { type: 'section', label: 'Plan' },
  { type: 'item', id: 'calendar', label: 'Calendar', icon: Calendar },
  { type: 'item', id: 'favorites', label: 'Favorites', icon: Star },
  { type: 'item', id: 'categories', label: 'Categories', icon: Tags },
  { type: 'item', id: 'templates', label: 'Templates', icon: BookmarkPlus },
  { type: 'section', label: 'Insight' },
  { type: 'item', id: 'insights', label: 'Insights', icon: Flame },
  { type: 'item', id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { type: 'item', id: 'focus', label: 'Focus Timer', icon: Timer },
  { type: 'section', label: 'Workspace' },
  { type: 'item', id: 'notifications', label: 'Notifications', icon: Bell },
  { type: 'item', id: 'team', label: 'Team', icon: Users },
  { type: 'item', id: 'trash', label: 'Trash', icon: Trash2 },
  { type: 'item', id: 'settings', label: 'Settings', icon: Settings },
];

const COLLAPSE_KEY = 'taskflow:sidebar-collapsed';

export default function Sidebar({ activeSection, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(COLLAPSE_KEY) === '1'
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Lock body scroll while the mobile drawer is up, and close it on Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen]);

  const renderNav = (isCollapsed: boolean) => (
    <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="Main">
      {navItems.map((entry, i) => {
        if (entry.type === 'section') {
          if (isCollapsed) {
            return <div key={`sec-${i}`} className="mx-2 my-2 h-px bg-hairline" />;
          }
          return (
            <p key={`sec-${i}`} className="caption-upper mt-5 mb-1.5 px-3 first:mt-1">
              {entry.label}
            </p>
          );
        }

        const Icon = entry.icon;
        const isActive = activeSection === entry.id;
        const badge = entry.id === 'notifications' && unreadCount > 0 ? unreadCount : 0;

        const button = (
          <button
            type="button"
            onClick={() => {
              onNavigate(entry.id);
              setMobileOpen(false);
            }}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex w-full items-center gap-2.5 rounded-lg text-[13.5px] font-medium',
              'transition-colors duration-200',
              isCollapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
              isActive
                ? 'text-gray-900 dark:text-gray-50'
                : 'text-gray-600 hover:bg-gray-200/45 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/60 dark:hover:text-gray-100'
            )}
            style={isActive ? { backgroundColor: 'var(--bg-sidebar-active)' } : undefined}
          >
            {/* Clay spine on the active row — the editorial alternative to a filled pill. */}
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute top-1.5 bottom-1.5 -left-2.5 w-[3px] rounded-r-full bg-yellow-400"
              />
            )}
            <Icon
              size={17}
              aria-hidden="true"
              className={cn(
                'shrink-0',
                isActive ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-400 dark:text-gray-500'
              )}
            />
            {!isCollapsed && <span className="truncate">{entry.label}</span>}
            {badge > 0 && (
              <span
                className={cn(
                  'flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-yellow-400 px-1 text-[10px] font-bold text-gray-950',
                  isCollapsed ? 'absolute top-1 right-1.5' : 'ml-auto'
                )}
              >
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        );

        return (
          <div key={entry.id} className="px-0.5">
            {isCollapsed ? (
              <Tooltip content={entry.label} side="right" delay={120}>
                {button}
              </Tooltip>
            ) : (
              button
            )}
          </div>
        );
      })}
    </nav>
  );

  const brand = (isCollapsed: boolean) => (
    <div
      className={cn(
        'flex h-16 shrink-0 items-center border-b border-hairline px-4',
        isCollapsed ? 'justify-center' : 'justify-between'
      )}
    >
      {isCollapsed ? (
        <LogoMark size={32} />
      ) : (
        <Logo
          size={32}
          wordmarkSize={17}
          subtitle={user?.name ? `${user.name.split(' ')[0]}'s workspace` : 'Workspace'}
          wordmarkClassName="text-[17px]"
        />
      )}
      {!isCollapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse sidebar"
          className="hidden shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-200/50 hover:text-gray-700 lg:flex dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          <PanelLeftClose size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  const footer = (isCollapsed: boolean) =>
    user && (
      <div className="shrink-0 border-t border-hairline p-3">
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <Tooltip content="Expand sidebar" side="right" delay={120}>
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                aria-label="Expand sidebar"
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-200/50 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                <PanelLeftOpen size={16} aria-hidden="true" />
              </button>
            </Tooltip>
            <Tooltip content={user.name} side="right" delay={120}>
              <button type="button" onClick={() => onNavigate('settings')} aria-label="Open settings">
                <Avatar name={user.name} size="sm" />
              </button>
            </Tooltip>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <Avatar name={user.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-gray-900 dark:text-gray-100">
                {user.name}
              </p>
              <p className="truncate text-[11px] text-gray-500 dark:text-gray-500">{user.email}</p>
            </div>
            <Tooltip content="Sign out">
              <button
                type="button"
                onClick={logout}
                aria-label="Sign out"
                className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/12 dark:hover:text-red-400"
              >
                <LogOut size={15} aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    );

  return (
    <>
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-hairline md:flex',
          'transition-[width] duration-300',
          collapsed ? 'w-[64px]' : 'w-[248px]'
        )}
        style={{ backgroundColor: 'var(--bg-sidebar)' }}
      >
        {brand(collapsed)}
        {renderNav(collapsed)}
        {footer(collapsed)}
      </aside>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation menu"
        className="fixed bottom-5 left-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gray-900 text-gray-50 shadow-lg md:hidden dark:bg-gray-100 dark:text-gray-900"
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-950/45 backdrop-blur-[2px]"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="relative flex h-full w-[272px] flex-col shadow-xl"
              style={{ backgroundColor: 'var(--bg-sidebar)' }}
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="absolute top-4 right-3 z-10 rounded-lg p-1.5 text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-800"
              >
                <X size={18} aria-hidden="true" />
              </button>
              {brand(false)}
              {renderNav(false)}
              {footer(false)}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
