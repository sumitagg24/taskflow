import { useCallback, useEffect, useRef, useState } from 'react';
import { authAPI } from '@/api/tasks';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

/* ============================================================================
   Social sign-in row — Auth0 only.

   Google (and any other social provider) is delivered through Auth0's
   Universal Login: enable the connection in the Auth0 dashboard and it shows
   up on Auth0's own screen — no per-provider UI here. The button renders only
   when BOTH the server has AUTH0 configured (`GET /api/auth/providers`) and
   the client holds the VITE_AUTH0_* env (needed to open the popup); with none
   available the whole row disappears and the email form stands alone.
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

function Auth0Glyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path
        fill="#EB5424"
        d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0Zm5.2 16.5h-2.1l-1.1-2.6h-3.9l-1.1 2.6H6.8l4.1-9h2.2l4.1 9Zm-3.3-4.2-1.1-2.7-1.1 2.7h2.2Z"
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

  const handleAuth0Popup = useCallback(async () => {
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
      // Signup mode lands on Universal Login's registration screen; login
      // forces a fresh credential prompt.
      const options =
        mode === 'register'
          ? { authorizationParams: { screen_hint: 'signup' } }
          : { authorizationParams: { prompt: 'login' } };
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
        ? 'Auth0 window was closed before completing sign-in.'
        : serverMessage || (err as Error)?.message || 'Auth0 sign-in failed. Please try again.';
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
        icon={!auth0Busy ? <Auth0Glyph /> : undefined}
        onClick={handleAuth0Popup}
        disabled={disabled}
        aria-label={`${verb} with Auth0`}
      >
        {verb} with Auth0
      </Button>
    </div>
  );
}
