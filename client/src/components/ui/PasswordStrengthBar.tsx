import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, User } from 'lucide-react';
import { motion } from 'framer-motion';

interface PasswordStrengthBarProps {
  password: string;
}

function getStrength(password: string): { score: number; label: string; color: string; bgColor: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Weak', color: 'bg-red-500', bgColor: 'bg-red-500' };
  if (score <= 2) return { score, label: 'Fair', color: 'bg-orange-500', bgColor: 'bg-orange-500' };
  if (score <= 3) return { score, label: 'Good', color: 'bg-yellow-500', bgColor: 'bg-yellow-500' };
  if (score <= 4) return { score, label: 'Strong', color: 'bg-lime-500', bgColor: 'bg-lime-500' };
  return { score: 5, label: 'Very Strong', color: 'bg-green-500', bgColor: 'bg-green-500' };
}

export default function PasswordStrengthBar({ password }: PasswordStrengthBarProps) {
  if (!password) return null;

  const { score, label, color, bgColor } = getStrength(password);

  const checks = [
    { label: 'At least 8 characters', met: password.length >= 8, icon: <User size={12} /> },
    { label: 'Contains uppercase letter', met: /[A-Z]/.test(password), icon: <span className="text-xs font-bold">A</span> },
    { label: 'Contains lowercase letter', met: /[a-z]/.test(password), icon: <span className="text-xs font-bold">a</span> },
    { label: 'Contains a number', met: /\d/.test(password), icon: <span className="text-xs font-bold">1</span> },
    { label: 'Contains special character', met: /[^a-zA-Z0-9]/.test(password), icon: <span className="text-xs font-bold">@</span> },
  ];

  return (
    <div className="space-y-2 animate-fadeIn">
      {/* Strength Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className={cn(
            'text-xs font-semibold transition-colors duration-300',
            score >= 1 ? 'text-green-600 dark:text-green-400' : 'text-red-500'
          )}>
            {label}
          </span>
        </div>
        <div className="flex gap-1 h-1.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={cn(
                'flex-1 rounded-full transition-all duration-300 ease-out',
                i <= score ? bgColor : 'bg-gray-200 dark:bg-gray-700'
              )}
            />
          ))}
        </div>
      </div>

      {/* Checklist */}
      <div className="space-y-1">
        {checks.map((check, index) => (
          <motion.div
            key={check.label}
            initial={{ opacity: 0, x: -5 }}
            animate={{ 
              opacity: check.met ? 1 : 0.6,
              x: 0
            }}
            transition={{ delay: index * 0.05 }}
            className="flex items-center gap-2 text-xs"
          >
            <div className={cn(
              'w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors duration-300',
              check.met 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' 
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
            )}>
              {check.met ? <CheckCircle2 size={10} /> : check.icon}
            </div>
            <span className={cn(
              'transition-colors duration-300',
              check.met ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'
            )}>
              {check.label}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
