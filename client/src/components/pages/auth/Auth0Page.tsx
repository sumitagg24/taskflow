import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, ArrowLeft, Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import AuthShell from './AuthShell';
import { AuthAlert } from './primitives';

const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN as string | undefined;
const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined;

interface Auth0PageProps {
  onBack?: () => void;
}

function Auth0Glyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EB5424"
        d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0Zm5.2 16.5h-2.1l-1.1-2.6h-3.9l-1.1 2.6H6.8l4.1-9h2.2l4.1 9Zm-3.3-4.2-1.1-2.7-1.1 2.7h2.2Z"
      />
    </svg>
  );
}

export default function Auth0Page({ onBack }: Auth0PageProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { auth0Login } = useAuth();

  const handleAuth0 = useCallback(async () => {
    if (busy) return;
    setLocalError(null);
    setBusy(true);
    try {
      const { Auth0Client } = await import('@auth0/auth0-spa-js');
      const client = new Auth0Client({
        domain: AUTH0_DOMAIN!,
        clientId: AUTH0_CLIENT_ID!,
        authorizationParams: {
          redirect_uri: window.location.origin,
        },
        cacheLocation: 'localstorage',
        useRefreshTokens: true,
      });
      await client.loginWithPopup({ authorizationParams: { prompt: 'login' } } as never);
      const claims = await client.getIdTokenClaims();
      const raw = (claims as unknown as { __raw?: string })?.__raw;
      if (!raw) throw new Error('No ID token from Auth0');
      await auth0Login(raw);
    } catch (err: unknown) {
      const msg =
        (err as { error?: string })?.error === 'popup_closed' ||
        String((err as Error)?.message || '').includes('Popup closed')
          ? 'Auth0 window was closed before completing sign-in.'
          : (err as Error)?.message || 'Auth0 sign-in failed. Please try again.';
      setLocalError(msg);
    } finally {
      setBusy(false);
    }
  }, [auth0Login, busy]);

  useEffect(() => {
    // Auto-triggering popup without user gesture is blocked. Do not auto-open.
  }, []);

  const isConfigured = Boolean(AUTH0_DOMAIN && AUTH0_CLIENT_ID);

  if (!isConfigured) {
    return (
      <AuthShell headline="Sign in with Auth0 — not configured yet.">
        <div className="space-y-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/30">
            <div className="flex gap-3">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  Auth0 is not configured
                </p>
                <p className="text-sm leading-relaxed text-amber-700 dark:text-amber-300/80">
                  Add{' '}
                  <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/50">
                    VITE_AUTH0_DOMAIN
                  </code>{' '}
                  and{' '}
                  <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/50">
                    VITE_AUTH0_CLIENT_ID
                  </code>{' '}
                  to client{' '}
                  <code className="font-mono text-xs">.env</code> and{' '}
                  <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/50">
                    AUTH0_DOMAIN
                  </code>{' '}
                  to server. Create a tenant at{' '}
                  <a
                    href="https://auth0.com"
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-amber-600/30 underline-offset-2 hover:decoration-amber-600"
                  >
                    Auth0
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
              <li>Create a Single Page Application in Auth0 Dashboard</li>
              <li>
                Add <code className="font-mono text-xs">http://localhost:3000</code> to Allowed
                Callback URLs, Logout URLs, and Web Origins
              </li>
              <li>Copy Domain & Client ID to both env files and restart</li>
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
    <AuthShell headline="One tap with Auth0 — enterprise-grade sign-in.">
      <div className="space-y-6">
        <div className="text-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
          >
            <Auth0Glyph size={32} />
          </motion.div>
          <h2 className="font-display text-xl tracking-tight text-gray-900 dark:text-gray-100">
            Continue with Auth0
          </h2>
          <p className="mx-auto mt-2 max-w-[30ch] text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            Universal Login with MFA, social, and enterprise connections — then your workspace is ready.
          </p>
        </div>

        {localError && <AuthAlert>{localError}</AuthAlert>}

        <Button
          type="button"
          variant="outline"
          fullWidth
          loading={busy}
          disabled={busy}
          onClick={handleAuth0}
          icon={!busy ? <Auth0Glyph size={18} /> : undefined}
          className="h-11 justify-center gap-3 border-gray-300 bg-white text-[15px] font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/80"
          aria-label="Continue with Auth0"
        >
          {busy ? 'Opening Auth0…' : 'Continue with Auth0'}
        </Button>

        <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <ShieldCheck size={14} className="shrink-0 text-gray-400" />
          <span>Auth0 handles your credentials — TaskFlow only gets your profile</span>
        </div>

        <div className="space-y-3 rounded-xl bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-gray-400">
            What happens next
          </p>
          <ul className="space-y-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-clay" />
              A popup opens to Auth0 — sign in there.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-clay" />
              We verify your Auth0 ID token via JWKS and create your workspace if needed.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-clay" />
              You land in TaskFlow with the same httpOnly session as Google/GitHub.
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
      </div>
    </AuthShell>
  );
}
