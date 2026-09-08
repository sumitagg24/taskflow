import { useCallback, useEffect, useRef, useState } from 'react';
import { authAPI } from '@/api/tasks';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

/* ============================================================================
   Social sign-in row — Google, delivered through Auth0.

   The button is Google-branded, but the OAuth dance runs through Auth0: the
   popup is opened with `connection=google-oauth2`, which sends the user
   straight to Google's consent screen — Auth0's own login page is never
   shown. The resulting Google ID token is minted by Auth0 (its `iss` is the
   tenant), so the server's existing Auth0 JWKS verification accepts it
   unchanged.

   Only requirement: the Google connection must be enabled in the Auth0
   dashboard (Authentication → Social → Google). When either side is missing
   (server without AUTH0_*, client without VITE_AUTH0_*, or connection off)
   the row hides and the email form stands alone.
   ========================================================================== */

const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN as string | undefined;
const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined;

// Only the flag this row acts on; google/github remain server-side concepts.
type Providers = { auth0: boolean };

// Module-level cache: the answer can't change without a server restart, and
// several auth pages mount this component in one session.
let providersCache: Providers | null = null;
let providersInFlight: Promise<Providers> | null = null;

function fetchProviders(): Promise<Providers> {
  if (providersCache) return Promise.resolve(providersCache);
  const inFlight = providersInFlight;
  if (inFlight) return inFlight;

  const request: Promise<Providers> = authAPI
    .getProviders()
    .then(({ data }) => {
      const result: Providers = {
        auth0: Boolean((data as unknown as { auth0?: boolean })?.auth0),
      };
      providersCache = result;
      return result;
    })
    .catch(() => {
      // Unreachable server — hide the button rather than offer a dead end.
      const offline: Providers = { auth0: false };
      providersCache = offline;
      return offline;
    });

  providersInFlight = request;
  void request.finally(() => {
    providersInFlight = null;
  });
  return request;
}

function GoogleGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
 );
}

interface SocialAuthProps {
  /** 'login' | 'register' — only changes the wording. */
  mode?: 'login' | 'register';
  onError?: (message: string) => void;
  /** Suppress interaction while the parent is mid-request. */
  busy?: boolean;
  className?: string;
}

export default function SocialAuth({ mode = 'login', onError, busy = false, className }: SocialAuthProps) {
  const [providers, setProviders] = useState<Providers | null>(providersCache);
  const [auth0Busy, setAuth0Busy] = useState(false);
  const { auth0Login } = useAuth();

  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    fetchProviders().then((next) => {
      if (aliveRef.current) setProviders(next);
    });
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const showAuth0 = Boolean(AUTH0_DOMAIN && AUTH0_CLIENT_ID) && providers?.auth0 === true;

  const handleGoogleViaAuth0 = useCallback(async () => {
    if (auth0Busy || !AUTH0_DOMAIN || !AUTH0_CLIENT_ID) return;
    setAuth0Busy(true);
    try {
      const { Auth0Client } = await import('@auth0/auth0-spa-js');
      const client = new Auth0Client({
        domain: AUTH0_DOMAIN,
        clientId: AUTH0_CLIENT_ID,
        authorizationParams: {
          redirect_uri: window.location.origin,
        },
        cacheLocation: 'localstorage',
        useRefreshTokens: true,
      });
      // `connection` skips Auth0's Universal Login page and jumps straight to
      // Google's consent screen — the user never sees Auth0 branding. Signup
      // mode adds screen_hint so new users get Google's account chooser.
      const options = {
        authorizationParams: {
          connection: 'google-oauth2',
          ...(mode === 'register' ? { screen_hint: 'signup' } : { prompt: 'login' }),
        },
      };
      await client.loginWithPopup(options as never);
      const claims = await client.getIdTokenClaims();
      const raw = (claims as unknown as { __raw?: string })?.__raw;
      if (!raw) throw new Error('No ID token from Auth0');
      await auth0Login(raw);
    } catch (err: unknown) {
      const closed =
        (err as { error?: string })?.error === 'popup_closed' ||
        String((err as Error)?.message || '').includes('Popup closed');
      // Server message first — axios's raw "Request failed with status code
      // N" tells the user nothing about what to do next.
      const serverMessage = (err as { response?: { data?: { message?: string } } })?.response
        ?.data?.message;
      const msg = closed
        ? 'Google sign-in was cancelled before completing.'
        : serverMessage || (err as Error)?.message || 'Google sign-in failed. Please try again.';
      onError?.(msg);
    } finally {
      if (aliveRef.current) setAuth0Busy(false);
    }
  }, [auth0Busy, auth0Login, mode, onError]);

  if (!showAuth0) return null;

  const disabled = busy || auth0Busy;
  const verb = mode === 'register' ? 'Sign up' : 'Continue';

  return (
    <div className={cn('mt-7', className)}>
      <div className="mb-5 flex items-center gap-4" aria-hidden="true">
        <hr className="rule flex-1" />
        <span className="caption-upper text-[11px] leading-none">or</span>
        <hr className="rule flex-1" />
      </div>

      <Button
        type="button"
        variant="outline"
        fullWidth
        loading={auth0Busy}
        icon={!auth0Busy ? <GoogleGlyph /> : undefined}
        onClick={handleGoogleViaAuth0}
        disabled={disabled}
        aria-label={`${verb} with Google`}
      >
        {verb} with Google
      </Button>
    </div>
  );
}
