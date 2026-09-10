import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, ArrowLeft, Globe } from 'lucide-react';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import AuthShell from './AuthShell';
import { AuthAlert } from './primitives';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

interface GoogleAuthPageProps {
  onBack?: () => void;
  onSuccess?: () => void;
}

function GoogleGStyleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09A6.97 6.97 0 0 1 5.48 12c0-.72.13-1.42.36-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 5.01l3.66-2.92Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
      />
    </svg>
  );
}

export default function GoogleAuthPage({ onBack }: GoogleAuthPageProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const { googleAuth } = useAuth();

  const {
    ready: googleReady,
    error: googleError,
    signIn,
    onCredentialCallback,
    onUnmount,
  } = useGoogleAuth(GOOGLE_CLIENT_ID);

  const handleCredential = useCallback(
    async (credential: string) => {
      setLocalError(null);
      try {
        await googleAuth(credential);
        // Success: AuthProvider will set user and App will auto-switch to authenticated shell
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Google sign-in failed. Please try again.';
        setLocalError(message);
      } finally {
        setGoogleBusy(false);
      }
    },
    [googleAuth]
  );

  useEffect(() => {
    onCredentialCallback(handleCredential);
  }, [handleCredential, onCredentialCallback]);

  useEffect(() => () => onUnmount(), [onUnmount]);

  useEffect(() => {
    if (googleError) {
      setGoogleBusy(false);
      setLocalError('Google sign-in is unavailable right now. Use your email instead.');
    }
  }, [googleError]);

  const isConfigured = Boolean(GOOGLE_CLIENT_ID);
  const canUseGoogle = isConfigured && googleReady && !googleError;

  const handleGoogleSignIn = () => {
    if (!canUseGoogle || googleBusy) return;
    setLocalError(null);
    setGoogleBusy(true);
    signIn();
    window.setTimeout(() => setGoogleBusy(false), 5000);
  };

  if (!isConfigured) {
    return (
      <AuthShell headline="Sign in with Google — not configured yet.">
        <div className="space-y-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/30">
            <div className="flex gap-3">
              <Globe className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  Google sign-in is not configured
                </p>
                <p className="text-sm leading-relaxed text-amber-700 dark:text-amber-300/80">
                  Add{' '}
                  <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/50">
                    VITE_GOOGLE_CLIENT_ID
                  </code>{' '}
                  to your client{' '}
                  <code className="font-mono text-xs">.env</code> and{' '}
                  <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/50">
                    GOOGLE_CLIENT_ID
                  </code>{' '}
                  to the server. Get a client ID at{' '}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-amber-600/30 underline-offset-2 hover:decoration-amber-600"
                  >
                    Google Cloud Console
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-hairline bg-surface p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
              <ShieldCheck size={16} className="text-clay" />
              How to enable
            </h3>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              <li>
                Create OAuth 2.0 Client ID for <em>Web application</em>
              </li>
              <li>
                Add <code className="font-mono text-xs">http://localhost:3000</code> to Authorized
                JavaScript origins
              </li>
              <li>Copy the Client ID to both env files and restart</li>
            </ol>
          </div>

          {onBack && (
            <Button variant="ghost" fullWidth onClick={onBack} icon={<ArrowLeft size={16} />}>
              Back to sign in
            </Button>
          )}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell headline="One tap with Google — then your workspace is ready.">
      <div className="space-y-6">
        <div className="text-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
          >
            <GoogleGStyleIcon size={32} />
          </motion.div>
          <h2 className="font-display text-xl tracking-tight text-gray-900 dark:text-gray-100">
            Continue with Google
          </h2>
          <p className="mx-auto mt-2 max-w-[28ch] text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            We&lsquo;ll create your workspace or sign you in — no password to remember.
          </p>
        </div>

        {localError && <AuthAlert>{localError}</AuthAlert>}

        <Button
          type="button"
          variant="outline"
          fullWidth
          loading={googleBusy}
          disabled={!canUseGoogle || googleBusy}
          onClick={handleGoogleSignIn}
          icon={!googleBusy ? <GoogleGStyleIcon size={18} /> : undefined}
          className="h-11 justify-center gap-3 border-gray-300 bg-white text-[15px] font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/80"
          aria-label="Continue with Google"
        >
          {googleBusy ? 'Opening Google…' : 'Continue with Google'}
        </Button>

        <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <ShieldCheck size={14} className="shrink-0 text-gray-400" />
          <span>Google only shares your name, email and avatar</span>
        </div>

        <div className="space-y-3 rounded-xl bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-gray-400">
            What happens next
          </p>
          <ul className="space-y-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-clay" />
              New here? We create your workspace instantly and verify your email.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-clay" />
              Returning? We sign you in and sync your theme and tasks.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-clay" />
              Your Google password never touches TaskFlow — Google handles it.
            </li>
          </ul>
        </div>

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mx-auto flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft size={14} />
            Back to email sign in
          </button>
        )}

        {!googleReady && !googleError && (
          <p className="text-center text-xs text-gray-400">Loading Google…</p>
        )}
      </div>
    </AuthShell>
  );
}
