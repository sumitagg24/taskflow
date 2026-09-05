import { useCallback, useEffect, useRef, useState } from 'react';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { authAPI } from '@/api/tasks';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/* ============================================================================
   Social sign-in row
   ----------------------------------------------------------------------------
   Two custom buttons rather than Google's rendered widget: GSI's `renderButton`
   demands ~200px and refuses to shrink, which breaks a 2-up row inside a 26rem
   column. `useGoogleAuth().signIn()` drives the same popup from our own markup.

   What renders is the intersection of two truths — the server's configured
   providers (`GET /api/auth/providers`) and the client's `VITE_GOOGLE_CLIENT_ID`
   (the browser needs the ID to open the popup at all). With neither available
   the whole block, divider included, disappears.
   ========================================================================== */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

type Providers = { google: boolean; github: boolean };

// Module-level cache: the answer can't change without a server restart, and
// several auth pages mount this component in one session.
let providersCache: Providers | null = null;
let providersInFlight: Promise<Providers> | null = null;

function fetchProviders(): Promise<Providers> {
  if (providersCache) return Promise.resolve(providersCache);
  if (providersInFlight) return providersInFlight;

  providersInFlight = authAPI
    .getProviders()
    .then(({ data }) => {
      providersCache = { google: Boolean(data?.google), github: Boolean(data?.github) };
      return providersCache;
    })
    .catch(() => {
      // Unreachable server — hide the buttons rather than offer a dead end.
      providersCache = { google: false, github: false };
      return providersCache;
    })
    .finally(() => {
      providersInFlight = null;
    });

  return providersInFlight;
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

function GitHubGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 fill-current">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.07-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A7.995 7.995 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

interface SocialAuthProps {
  /** 'login' | 'register' — only changes the wording. */
  mode?: 'login' | 'register';
  /** Called with a Google ID token; usually `AuthContext.googleAuth`. */
  onGoogleCredential: (credential: string) => void | Promise<void>;
  onError?: (message: string) => void;
  /** Suppress interaction while the parent is mid-request. */
  busy?: boolean;
  className?: string;
}

export default function SocialAuth({
  mode = 'login',
  onGoogleCredential,
  onError,
  busy = false,
  className,
}: SocialAuthProps) {
  const [providers, setProviders] = useState<Providers | null>(providersCache);
  const [githubRedirecting, setGithubRedirecting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const {
    ready: googleReady,
    error: googleError,
    signIn,
    onCredentialCallback,
    onUnmount,
  } = useGoogleAuth(GOOGLE_CLIENT_ID);

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

  const handleCredential = useCallback(
    (credential: string) => {
      setGoogleBusy(false);
      void onGoogleCredential(credential);
    },
    [onGoogleCredential]
  );

  useEffect(() => {
    onCredentialCallback(handleCredential);
  }, [handleCredential, onCredentialCallback]);

  useEffect(() => () => onUnmount(), [onUnmount]);

  useEffect(() => {
    if (googleError) {
      setGoogleBusy(false);
      onError?.('Google sign-in is unavailable right now. Use your email instead.');
    }
  }, [googleError, onError]);

  const showGoogle = Boolean(GOOGLE_CLIENT_ID) && providers?.google === true && !googleError;
  const showGithub = providers?.github === true;

  if (!showGoogle && !showGithub) return null;

  const disabled = busy || githubRedirecting || googleBusy;
  const verb = mode === 'register' ? 'Sign up' : 'Continue';

  const handleGoogle = () => {
    if (disabled || !googleReady) return;
    setGoogleBusy(true);
    signIn();
    // signIn()'s own 5s safety net resets its internal busy flag; mirror it
    // here so the button never stays stuck if the user closes the popup.
    window.setTimeout(() => {
      if (aliveRef.current) setGoogleBusy(false);
    }, 5000);
  };

  const handleGithub = () => {
    if (disabled) return;
    setGithubRedirecting(true);
    // Full-page handoff: the server holds the client secret and sets the CSRF
    // state cookie, so this cannot be done with fetch.
    window.location.assign('/api/auth/github');
  };

  return (
    <div className={cn('mt-7', className)}>
      <div className="mb-5 flex items-center gap-4" aria-hidden="true">
        <hr className="rule flex-1" />
        <span className="caption-upper text-[11px] leading-none">or</span>
        <hr className="rule flex-1" />
      </div>

      <div className={cn('grid gap-3', showGoogle && showGithub ? 'grid-cols-2' : 'grid-cols-1')}>
        {showGoogle && (
          <Button
            type="button"
            variant="outline"
            fullWidth
            loading={googleBusy}
            icon={!googleBusy ? <GoogleGlyph /> : undefined}
            onClick={handleGoogle}
            disabled={disabled || !googleReady}
            aria-label={`${verb} with Google`}
          >
            Google
          </Button>
        )}

        {showGithub && (
          <Button
            type="button"
            variant="outline"
            fullWidth
            loading={githubRedirecting}
            icon={!githubRedirecting ? <GitHubGlyph /> : undefined}
            onClick={handleGithub}
            disabled={disabled}
            aria-label={`${verb} with GitHub`}
          >
            GitHub
          </Button>
        )}
      </div>
    </div>
  );
}
