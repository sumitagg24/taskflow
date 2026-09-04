import { useEffect, useRef, useState } from 'react';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import AuthShell from './AuthShell';
import { AuthLinkButton, AuthStatus } from './primitives';

/* ============================================================================
   /auth/callback — the landing strip for the GitHub redirect flow
   ----------------------------------------------------------------------------
   The server finishes the OAuth handshake and sends the browser here with
   either `?code=…` (a single-use, 60s exchange code) or `?error=…&message=…`.
   We POST the code straight back for real tokens, so no JWT ever appears in a
   URL, then scrub the query so a reload can't replay a burnt code.
   ========================================================================== */

/** Copy for the error codes `githubCallback` can redirect with. */
const ERROR_COPY: Record<string, string> = {
  PROVIDER_NOT_CONFIGURED:
    'GitHub sign-in is not set up on this server yet. Use your email and password instead.',
  PROVIDER_DENIED: 'You cancelled the GitHub authorisation, so nothing was shared.',
  STATE_MISMATCH:
    'That sign-in link could not be verified. Start again from this page so we can issue a fresh one.',
  MISSING_CODE: 'GitHub did not send an authorisation code back. Please try again.',
  TOKEN_EXCHANGE_FAILED: 'GitHub would not complete the exchange. Please try again in a moment.',
  NO_PROFILE: 'We could not read your GitHub profile. Please try again.',
  NO_VERIFIED_EMAIL:
    'Your GitHub account has no verified email address. Verify one on GitHub, or sign up with your email here.',
  ACCOUNT_EXISTS_WITH_DIFFERENT_PROVIDER:
    'An account already uses that email address. Sign in the way you created it, then link GitHub from Settings.',
  INVALID_EXCHANGE_CODE: 'That sign-in link has already been used or has expired. Please try again.',
  UNEXPECTED: 'Something went wrong finishing the sign-in. Please try again.',
};

interface OAuthCallbackPageProps {
  /** Clear the callback URL and drop back to the auth screen. */
  onDone: () => void;
}

export default function OAuthCallbackPage({ onDone }: OAuthCallbackPageProps) {
  const { exchangeOAuthCode } = useAuth();
  const [failure, setFailure] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errorCode = params.get('error');
    const serverMessage = params.get('message');

    // Burn the query immediately: the code is single-use, and leaving it in the
    // address bar invites a reload that can only ever fail.
    window.history.replaceState({}, '', '/');

    if (errorCode || !code) {
      setFailure(
        (errorCode && ERROR_COPY[errorCode]) ||
          serverMessage ||
          ERROR_COPY.UNEXPECTED
      );
      return;
    }

    exchangeOAuthCode(code).catch((err: any) => {
      const code2 = err?.response?.data?.code;
      setFailure(
        (code2 && ERROR_COPY[code2]) ||
          err?.response?.data?.message ||
          ERROR_COPY.UNEXPECTED
      );
    });
    // exchangeOAuthCode is recreated each render; the ref guard makes the
    // single-shot behaviour explicit instead of relying on dep identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthShell headline="One moment — finishing your sign-in.">
      {failure ? (
        <AuthStatus
          tone="error"
          icon={<ShieldAlert size={26} />}
          title="Sign-in didn't finish"
          action={<AuthLinkButton onClick={onDone}>Back to sign in</AuthLinkButton>}
        >
          {failure}
        </AuthStatus>
      ) : (
        <AuthStatus tone="neutral" icon={<KeyRound size={24} className="animate-pulse" />} title="Signing you in">
          Trading your one-time code for a session. This usually takes a second.
        </AuthStatus>
      )}
    </AuthShell>
  );
}
