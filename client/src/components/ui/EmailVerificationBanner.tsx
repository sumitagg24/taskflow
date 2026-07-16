import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Mail, Loader2, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const RESEND_COOLDOWN = 60;

export default function EmailVerificationBanner() {
  const { user, resendVerification } = useAuth();
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const handleResend = useCallback(async () => {
    if (!user?.email || sending || cooldown > 0) return;
    setSending(true);
    try {
      await resendVerification(user.email);
      toast.success('Verification email sent');
      setCooldown(RESEND_COOLDOWN);
      const interval = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to send verification email');
    } finally {
      setSending(false);
    }
  }, [user?.email, sending, cooldown, resendVerification]);

  if (!user || user.emailVerified || dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/20 px-4 py-3"
    >
      <div className="flex items-center justify-between gap-3 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
          <Mail size={16} className="shrink-0" />
          <span>
            Please verify your email address.{' '}
            <button
              onClick={handleResend}
              disabled={sending || cooldown > 0}
              className="underline font-medium hover:text-amber-800 dark:hover:text-amber-300 disabled:opacity-50 disabled:no-underline"
            >
              {sending ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" />
                  Sending...
                </span>
              ) : cooldown > 0 ? (
                `Resend in ${cooldown}s`
              ) : (
                'Resend verification email'
              )}
            </button>
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </motion.div>
  );
}
