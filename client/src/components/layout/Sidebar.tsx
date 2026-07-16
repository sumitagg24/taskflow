import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard, ListTodo, ClipboardList, ArrowRightCircle,
  CheckCircle2, Archive, Calendar, Tags, BarChart3, Timer,
  Bell, Settings, ChevronLeft, ChevronRight,
  LogOut, Sparkles, Menu, X, Star, Users, BookmarkPlus,
} from 'lucide-react';

interface SidebarProps {
  activeSection: string;
  onNavigate: (section: string) => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'all', label: 'All Tasks', icon: ListTodo },
  { type: 'divider' as const },
  { id: 'pending', label: 'To Do', icon: ClipboardList },
  { id: 'in-progress', label: 'In Progress', icon: ArrowRightCircle },
  { id: 'completed', label: 'Completed', icon: CheckCircle2 },
  { id: 'backlog', label: 'Backlog', icon: Archive },
  { type: 'divider' as const },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'favorites', label: 'Favorites', icon: Star },
  { id: 'categories', label: 'Categories', icon: Tags },
  { id: 'templates', label: 'Templates', icon: BookmarkPlus },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'focus', label: 'Focus Timer', icon: Timer },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'team', label: 'Team', icon: Users },
  { type: 'divider' as const },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ activeSection, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { resolvedTheme } = useTheme();
  const { user, logout } = useAuth();

  const sidebarContent = (
    <div className={cn(
      'flex h-full flex-col',
      collapsed ? 'w-[68px]' : 'w-[260px]'
    )}>
      {/* Logo */}
      <div className={cn(
        'flex items-center border-b border-gray-100 dark:border-gray-800/50 px-4 h-16',
        collapsed ? 'justify-center' : 'justify-between'
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-400">
              <Sparkles size={16} className="text-gray-900" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">TaskFlow</h1>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">Workspace</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-400">
            <Sparkles size={16} className="text-gray-900" />
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex items-center justify-center rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {navItems.map((item, i) => {
          if ('type' in item && item.type === 'divider') {
            return (
              <div key={`divider-${i}`} className={cn(
                'my-2 border-t border-gray-100 dark:border-gray-800/50',
                collapsed && 'mx-2'
              )} />
            );
          }
          const Icon = item.icon!;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onNavigate(item.id!);
                setMobileOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                collapsed && 'justify-center px-2',
                isActive
                  ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400'
                  : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/50 hover:text-gray-700 dark:hover:text-gray-200'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className={cn(
                'shrink-0',
                isActive ? 'text-yellow-500' : 'text-gray-400 dark:text-gray-500'
              )} />
              {!collapsed && <span>{item.label}</span>}
              {isActive && !collapsed && (
                <motion.div
                  layoutId="activeIndicator"
                  className="ml-auto h-2 w-2 rounded-full bg-yellow-400"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* User Profile */}
      {!collapsed && user && (
        <div className="border-t border-gray-100 dark:border-gray-800/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-orange-400 text-sm font-bold text-gray-900">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user.name}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{user.email}</p>
            </div>
            <button
              onClick={logout}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-red-500 transition-colors"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={cn(
        'hidden md:flex h-screen flex-col border-r border-gray-100 dark:border-gray-800/50',
        'transition-all duration-300 ease-in-out shrink-0',
        collapsed ? 'w-[68px]' : 'w-[260px]'
      )}
        style={{ backgroundColor: 'var(--bg-sidebar)' }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation menu"
        className="fixed bottom-4 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-400 text-gray-900 shadow-lg shadow-yellow-500/30 md:hidden"
      >
        <Menu size={20} />
      </button>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="h-full w-[280px] shadow-xl"
              style={{ backgroundColor: 'var(--bg-sidebar)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-end p-3">
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X size={20} />
                </button>
              </div>
              {sidebarContent}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
