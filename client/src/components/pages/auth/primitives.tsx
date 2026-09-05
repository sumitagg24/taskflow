import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Eye, EyeOff, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';

/* ============================================================================
   Shared bits of the auth surface
   ----------------------------------------------------------------------------
   Five screens (sign in/up, forgot, reset, verify, OAuth callback) share one
   voice: a serif heading, a quiet line of prose, and a single tinted panel for
   anything that went right or wrong. Keeping them here stops the five copies
   from drifting apart.
   ========================================================================== */

export function AuthHeading({
  title,
  children,
  eyebrow,
}: {
  title: string;
  /** Supporting line under the heading. */
  children?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="mb-7">
      {eyebrow && <p className="caption-upper mb-2.5">{eyebrow}</p>}
      <h2 className="font-display text-2xl leading-tight tracking-tight text-gray-900 dark:text-gray-100">
        {title}
      </h2>
      {children && (
        <p className="mt-2 text-[14px] leading-relaxed text-gray-600 dark:text-gray-400">{children}</p>
      )}
    </header>
  );
}

const TONE = {
  error: {
    panel: 'border-red-200 bg-red-50/80 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300',
    Icon: XCircle,
  },
  warning: {
    panel:
      'border-amber-200 bg-amber-50/80 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200',
    Icon: AlertCircle,
  },
  success: {
    panel:
      'border-green-200 bg-green-50/80 text-green-700 dark:border-green-500/25 dark:bg-green-500/10 dark:text-green-300',
    Icon: CheckCircle2,
  },
} as const;

export function AuthAlert({
  tone = 'error',
  children,
  className,
}: {
  tone?: keyof typeof TONE;
  children: ReactNode;
  className?: string;
}) {
  const { panel, Icon } = TONE[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('mb-5 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[13px] leading-snug', panel, className)}
    >
      <Icon size={16} className="mt-px shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </motion.div>
  );
}

const STATUS_RING = {
  success: 'bg-green-100 text-green-600 dark:bg-green-500/12 dark:text-green-400',
  error: 'bg-red-100 text-red-600 dark:bg-red-500/12 dark:text-red-400',
  neutral: 'bg-surface text-clay dark:bg-clay/12 dark:text-clay',
} as const;

/** Full-panel outcome: icon, serif title, prose, and one way onward. */
export function AuthStatus({
  tone = 'neutral',
  icon,
  title,
  children,
  action,
}: {
  tone?: keyof typeof STATUS_RING;
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={children}
      action={action}
      iconClassName={STATUS_RING[tone]}
      className="px-0 py-0"
    />
  );
}

/** Text button used for "Back to sign in" and the mode switch. */
export function AuthLinkButton({
  onClick,
  children,
  className,
}: {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md font-medium text-clay underline decoration-clay/30 decoration-1 underline-offset-[3px]',
        'transition-colors hover:decoration-clay focus-visible:ring-[3px] focus-visible:ring-yellow-400/15',
        className
      )}
    >
      {children}
    </button>
  );
}

/** Eye toggle for a password field. Skipped in the tab order on purpose. */
export function RevealToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      tabIndex={-1}
      aria-label={shown ? 'Hide password' : 'Show password'}
      className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-surface hover:text-gray-700 focus-visible:ring-[3px] focus-visible:ring-yellow-400/15 dark:hover:text-gray-200"
    >
      {shown ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );
}

/** Primary action, sized for the auth column. */
export function AuthSubmit({
  loading = false,
  loadingLabel,
  children,
  disabled,
}: {
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Button type="submit" variant="primary" fullWidth loading={loading} disabled={disabled}>
      {loading ? loadingLabel ?? 'Working…' : children}
    </Button>
  );
}
