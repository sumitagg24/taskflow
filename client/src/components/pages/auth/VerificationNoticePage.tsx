import { useState, FormEvent, useEffect, useRef } from 'react';
import { Mail, MailWarning } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/Input';
import AuthShell from './AuthShell';
import { AuthAlert, AuthHeading, AuthLinkButton, AuthSubmit } from './primitives';

/* ============================================================================
   Verification notice — the way out of a dead end
   ----------------------------------------------------------------------------
   Local sign-in is refused until the address is verified, and the in-app
   resend banner needs a session. Without this screen, anybody who loses the
   original email has no route back to their account.
   ========================================================================== */

const RESEND_COOLDOWN = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface VerificationNoticePageProps {
  /** Whatever was typed into the sign-in field — an email, or a username. */
  identifier?: string;
  onBack: () => void;
}

export default function VerificationNoticePage({
  identifier = '',
  onBack,
}: VerificationNoticePageProps) {
  const { resendVerification } = useAuth();
  // A username tells us nothing the resend endpoint can use, so only carry an
  // address over and ask for one otherwise.
  const [email, setEmail] = useState(EMAIL_RE.test(identifier.trim()) ? identifier.trim() : '');
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => () => clearInterval(timerRef.current), []);

  const handleResend = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (sending || cooldown > 0) return;
    if (!EMAIL_RE.test(trimmed)) {
      setError('Enter the email address you signed up with.');
      return;
    }

    setSending(true);
    setError('');
    try {
      await resendVerification(trimmed);
      setSent(true);
      setCooldown(RESEND_COOLDOWN);
      timerRef.current = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not send that email. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthShell
      headline="Almost in. Just confirm the address."
      points={[
        'The link proves the inbox is yours',
        'One click and your workspace opens',
        'Lost it? Send yourself another below',
      ]}
    >
      <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/12 dark:text-amber-400">
        <MailWarning size={24} aria-hidden="true" />
      </div>

      <AuthHeading title="Verify your email first." eyebrow="One more step">
        Sign-in stays closed until the address on your account is confirmed. Check your inbox — and
        your spam folder — for the link we sent when you signed up.
      </AuthHeading>

      {error && <AuthAlert>{error}</AuthAlert>}
      {sent && !error && (
        <AuthAlert tone="success">
          A fresh link is on its way. It replaces any earlier one.
        </AuthAlert>
      )}

      <form onSubmit={handleResend} className="space-y-4" noValidate>
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          icon={<Mail size={16} />}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={!email}
          required
        />
        <AuthSubmit
          loading={sending}
          loadingLabel="Sending…"
          disabled={!email.trim() || cooldown > 0}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send a new link'}
        </AuthSubmit>
      </form>

      <p className="mt-7 text-[13px] text-gray-500 dark:text-gray-400">
        Already confirmed it? <AuthLinkButton onClick={onBack}>Back to sign in</AuthLinkButton>
      </p>
    </AuthShell>
  );
}
