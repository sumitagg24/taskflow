import { motion } from 'framer-motion';
import { Users, UserPlus, Sparkles, CheckCircle2 } from 'lucide-react';

export default function TeamPage() {
  // Team collaboration is a roadmap item, not yet shipped. We surface a clear
  // "what's here, what isn't" state instead of pretending a working team
  // workspace with hardcoded mock members.
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 lg:p-6 max-w-3xl mx-auto"
    >
      <div className="flex items-center gap-3 mb-6">
        <Users size={24} className="text-yellow-500" />
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Team</h2>
          <p className="text-sm text-gray-400">Workspace collaboration</p>
        </div>
      </div>

      <div className="card p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-400 shadow-lg shadow-yellow-500/20">
            <UserPlus size={28} className="text-white" />
          </div>
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
          Team workspaces are coming soon
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
          We're building shared workspaces where you can invite teammates, assign
          tasks to each other, and get a single digest for the whole crew.
          In the meantime, all your tasks are private to your account.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto text-left">
          {[
            { title: 'Shared tasks', icon: CheckCircle2 },
            { title: 'Member roles', icon: Users },
            { title: 'Team digest', icon: Sparkles },
          ].map(({ title, icon: Icon }) => (
            <div
              key={title}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-3 flex items-center gap-2"
            >
              <Icon size={16} className="text-yellow-500 shrink-0" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Soon</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
