import { useState, useEffect, useRef } from 'react';
import { Loader2, MailCheck, MailX } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import AuthShell from './auth/AuthShell';
import { AuthLinkButton, AuthStatus } from './auth/primitives';

const SHELL = {
  headline: 'Confirming it is really you.',
  points: [
    'Verification keeps someone else from using your address',
    'It only has to happen once per account',
    'Links expire, but a new one is always a click away',
  ],
} as const;

interface VerifyEmailPageProps {
  token: string;
  onSuccess: () => void;
}

export default function VerifyEmailPage({ token, onSuccess }: VerifyEmailPageProps) {
  const { verifyEmail } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const hasVerified = useRef(false);

  useEffect(() => {
    // The token is single-use, so StrictMode's double effect must not spend it twice.
    if (hasVerified.current) return;
    hasVerified.current = true;

    if (!token) {
      setStatus('error');
      setMessage(
        'This link is missing its verification token. Open the link from your email again, or ask for a fresh one.'
      );
      return;
    }

    verifyEmail(token)
      .then(() => {
        setStatus('success');
        // Scrub the spent token, then hand control back to the auth screen.
        window.history.replaceState({}, '', '/');
        setTimeout(onSuccess, 2200);
      })
      .catch((err: any) => {
        setStatus('error');
        setMessage(
          err?.response?.data?.message ||
            err?.message ||
            'We could not verify that link — it may have already been used or expired.'
        );
      });
    // Single-shot on mount: verifyEmail and onSuccess are recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthShell headline={SHELL.headline} points={SHELL.points}>
      {status === 'loading' && (
        <AuthStatus
          tone="neutral"
          icon={<Loader2 size={24} className="animate-spin" />}
          title="Verifying your email"
        >
          This takes a second. Keep this tab open.
        </AuthStatus>
      )}

      {status === 'success' && (
        <AuthStatus
          tone="success"
          icon={<MailCheck size={26} />}
          title="Email verified"
          action={<AuthLinkButton onClick={onSuccess}>Go to sign in</AuthLinkButton>}
        >
          That is all we needed. Taking you back to sign in…
        </AuthStatus>
      )}

      {status === 'error' && (
        <AuthStatus
          tone="error"
          icon={<MailX size={26} />}
          title="Verification didn't finish"
          action={<AuthLinkButton onClick={onSuccess}>Back to sign in</AuthLinkButton>}
        >
          {message}
        </AuthStatus>
      )}
    </AuthShell>
  );
}
