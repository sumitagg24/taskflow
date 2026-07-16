import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import {
  Search, Plus, ChevronDown,
  Settings, LogOut, User, Sparkles,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

interface NavbarProps {
  onNewTask: () => void;
  onSearch?: (query: string) => void;
  onOpenAIAssistant?: () => void;
  onNavigate?: (section: string) => void;
}

export default function Navbar({ onNewTask, onSearch, onOpenAIAssistant, onNavigate }: NavbarProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const profileRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { resolvedTheme } = useTheme();
  const { user, logout } = useAuth();

  // Keyboard shortcut: Cmd+K or Ctrl+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close profile menu on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch?.(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, onSearch]);

  // Keyboard shortcut for new task: Cmd+N
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        onNewTask();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNewTask]);

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-[#0f0f13]/80 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800/50">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6 gap-4">
        {/* Left: Breadcrumb */}
        <div className="hidden sm:block">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Dashboard <span className="mx-1.5 text-gray-300 dark:text-gray-600">/</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">Workspace</span>
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{dateStr}</p>
        </div>

        {/* Center: Search */}
        <div className="flex-1 max-w-lg mx-auto">
          <div
            className={cn(
              'relative flex items-center rounded-xl border transition-all duration-200',
              searchFocused
                ? 'border-yellow-400 shadow-lg shadow-yellow-500/10 bg-white dark:bg-gray-900'
                : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600'
            )}
          >
            <Search size={16} className="ml-3 text-gray-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search tasks... (Cmd+K)"
              className="w-full bg-transparent px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
            />
            <kbd className="mr-2 hidden sm:inline-flex items-center gap-0.5 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
              <span className="text-xs">⌘</span>K
            </kbd>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          {/* AI Assistant */}
          <button
            onClick={onOpenAIAssistant}
            className="hidden sm:flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors"
          >
            <Sparkles size={16} />
            <span className="hidden lg:inline">Ask AI</span>
          </button>

          {/* New Task */}
          <button
            onClick={onNewTask}
            className="flex items-center gap-1.5 rounded-xl bg-yellow-400 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-yellow-500 transition-all hover:shadow-lg hover:shadow-yellow-500/20"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">New Task</span>
          </button>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Profile */}
          <div ref={profileRef} className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-orange-400 text-sm font-bold text-gray-900">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <ChevronDown size={14} className="text-gray-400 hidden sm:block" />
            </button>

            <AnimatePresence>
              {showProfileMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a23] shadow-xl py-2 z-50"
                >
                  <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.name}</p>
                    <p className="text-xs text-gray-500">{user?.email}</p>
                  </div>
                  <button
                    onClick={() => { onNavigate?.('dashboard'); setShowProfileMenu(false); }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <User size={16} />
                    Profile
                  </button>
                  <button
                    onClick={() => { onNavigate?.('settings'); setShowProfileMenu(false); }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Settings size={16} />
                    Settings
                  </button>
                  <div className="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
                    <button
                      onClick={logout}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut size={16} />
                      Sign out
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
