import { useState, FormEvent } from 'react';
import { ArrowLeft, MailCheck, Mail } from 'lucide-react';
import { authAPI } from '@/api/tasks';
import { Input } from '@/components/ui/Input';
import AuthShell from './auth/AuthShell';
import { AuthAlert, AuthHeading, AuthLinkButton, AuthStatus, AuthSubmit } from './auth/primitives';

interface ForgotPasswordPageProps {
  onBack: () => void;
}

export default function ForgotPasswordPage({ onBack }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      await authAPI.forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not send the reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      headline="Locked out? It happens."
      points={[
        'One link, valid for 30 minutes',
        'Your tasks and history stay exactly as they are',
        'Nothing changes until you set a new password',
      ]}
    >
      {sent ? (
        <AuthStatus
          tone="success"
          icon={<MailCheck size={26} />}
          title="Check your inbox"
          action={<AuthLinkButton onClick={onBack}>Back to sign in</AuthLinkButton>}
        >
          If an account exists for <strong className="font-medium text-gray-800 dark:text-gray-200">{email}</strong>,
          a reset link is on its way. It expires in 30 minutes.
        </AuthStatus>
      ) : (
        <>
          <button
            type="button"
            onClick={onBack}
            className="mb-7 inline-flex items-center gap-1.5 rounded-sm text-[13px] text-gray-500 transition-colors hover:text-clay focus:outline-none focus-visible:ring-[3px] focus-visible:ring-clay/25 dark:text-gray-400"
          >
            <ArrowLeft size={14} />
            Back to sign in
          </button>

          <AuthHeading title="Reset your password.">
            Tell us the email on your account and we'll send a single-use link.
          </AuthHeading>

          {error && <AuthAlert>{error}</AuthAlert>}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
              autoFocus
              required
            />
            <AuthSubmit loading={loading} loadingLabel="Sending…" disabled={!email.trim()}>
              Send reset link
            </AuthSubmit>
          </form>

          <p className="mt-7 text-[13px] leading-relaxed text-gray-500 dark:text-gray-500">
            We send the same response either way, so this page never reveals whether an address has
            an account.
          </p>
        </>
      )}
    </AuthShell>
  );
}
