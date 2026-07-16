import { useState, useEffect, useRef, useCallback } from 'react';

interface GoogleCredentialResponse {
  credential?: string;
  select_by?: string;
  clientId?: string;
}

type GoogleCallback = (response: GoogleCredentialResponse) => void;






// ─── Module-level singletons ─────────────────────────────────────────────────
// These live for the entire application lifetime in the browser. Since React
// runs in a single thread, concurrent access is always interleaved — never truly
// parallel. The Promise chain serialises all concurrent callers automatically.

let googleScriptPromise: Promise<void> | null = null;
let googleInitializePromise: Promise<void> | null = null;

// ─── Application-wide session management (BIS recommendations) ─────────────────
// Called once on logout to reset Google session state.  google.accounts.id
// is a global singleton — calling these methods does not require a clientId.
export function googleSignOut(): void {
  try {
    window.google?.accounts?.id?.cancelPrompt();
  } catch {
    // no-op
  }
  try {
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    // no-op
  }
}

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }
  if (googleScriptPromise) {
    return googleScriptPromise;
  }

  googleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.id) {
        resolve();
      } else {
        googleScriptPromise = null;
        reject(new Error('Google script loaded but accounts API missing'));
      }
    };
    script.onerror = () => {
      googleScriptPromise = null;
      reject(new Error('Failed to load Google GSI script'));
    };
    document.body.appendChild(script);
  });

  return googleScriptPromise;
}

export function useGoogleAuth(clientId: string | undefined) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [credential, setCredential] = useState<string | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);

  const clientIdRef = useRef(clientId);
  const callbackRef = useRef<((credential: string) => void) | null>(null);
  const credentialRef = useRef<string | null>(null);
  const signInTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync refs
  useEffect(() => {
    credentialRef.current = credential;
  }, [credential]);

  if (clientId) clientIdRef.current = clientId;

  const onCredentialCallback = useCallback((callback: (credential: string) => void) => {
    callbackRef.current = callback;
  }, []);

  useEffect(() => {
    if (!clientId) return;

    // SDK already initialised — mark ready without calling initialize() again.
    if (window.google?.accounts?.id) {
      setReady(true);
      setError(false);
      return;
    }

    // A previous mount already started initialising — wait for it.
    if (googleInitializePromise) {
      googleInitializePromise
        .then(() => {
          setReady(true);
          setError(false);
        })
        .catch(() => {
          setError(true);
        });
      return;
    }

    // Start the initialisation chain. Subsequent callers during this async
    // window will hit the guard above and share the same promise.
    googleInitializePromise = (async () => {
      try {
        await loadGoogleScript();
        if (!window.google?.accounts?.id) {
          throw new Error('Google accounts API not available');
        }

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: GoogleCredentialResponse) => {
            if (response?.credential) {
              setCredential(response.credential);
              setCredentialError(null);
              setBusy(false);
              // Clear any pending signIn() timeout
              if (signInTimeoutRef.current !== null) {
                clearTimeout(signInTimeoutRef.current);
                signInTimeoutRef.current = null;
              }
              if (callbackRef.current) {
                callbackRef.current(response.credential);
              }
            } else {
              setCredentialError('No credential returned from Google');
              setBusy(false);
            }
          },
          cancel_on_tap_outside: false,
          // Prevent One Tap from auto-rendering and competing with our button
          auto_prompt_enabled: false,
        });
      } catch {
        googleInitializePromise = null;
        throw new Error('Google SDK init failed');
      }
    })();

    googleInitializePromise
      .then(() => {
        setReady(true);
        setError(false);
      })
      .catch(() => {
        setError(true);
        googleInitializePromise = null;
      });
  }, [clientId]);

  // Render the Google Sign-In button into a container element.
  const renderButton = useCallback((container: HTMLElement | null) => {
    if (!clientIdRef.current || !window.google?.accounts?.id || !container) {
      return;
    }
    container.innerHTML = '';
    const width = Math.min(
      container.offsetWidth || container.parentElement?.offsetWidth || 400,
      400
    );
    window.google.accounts.id.renderButton(container, {
      theme: 'outline',
      size: 'large',
      width,
      text: 'signin_with',
      type: 'standard',
    });
  }, []);

  // Trigger One Tap prompt (not used by the button flow but exposed for completeness).
  const triggerPrompt = useCallback(() => {
    if (!clientIdRef.current || !window.google?.accounts?.id) return;
    if (error) return;
    setBusy(true);
    setCredential(null);
    setCredentialError(null);
    try {
      window.google.accounts.id.prompt((notification) => {
        if (
          notification.isNotDisplayed() ||
          notification.isSkippedMoment() ||
          notification.isDismissedMoment()
        ) {
          setBusy(false);
        }
      });
    } catch {
      setBusy(false);
    }
  }, [error]);

  // Programmatic sign-in — renders a hidden button and clicks it.
  // The Google popup fires our callback on credential response.
  const signIn = useCallback(() => {
    if (!clientIdRef.current || !window.google?.accounts?.id) return;
    if (error) return;
    setBusy(true);
    setCredential(null);
    setCredentialError(null);

    const container = document.createElement('div');
    container.style.cssText =
      'position:absolute;left:-9999px;visibility:hidden;pointer-events:none';
    document.body.appendChild(container);

    window.google.accounts.id.renderButton(container, {
      theme: 'outline',
      size: 'large',
      width: 400,
      text: 'signin_with',
      type: 'standard',
    });

    const button = container.querySelector('[role="button"]') as HTMLElement | null;
    if (button) {
      button.click();
    } else {
      // Button not yet rendered — retry on next microtask.
      requestAnimationFrame(() => {
        const retry = container.querySelector('[role="button"]') as HTMLElement | null;
        if (retry) {
          retry.click();
        } else {
          // Truly absent — clean up and give up.
          document.body.removeChild(container);
          setBusy(false);
        }
      });
    }

    // Safety net: if no credential arrives within 5 s, remove the container
    // and reset busy.  The credential callback also clears this timeout on
    // successful receipt (see the callback above).
    if (signInTimeoutRef.current !== null) {
      clearTimeout(signInTimeoutRef.current);
    }
    signInTimeoutRef.current = setTimeout(() => {
      signInTimeoutRef.current = null;
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
      if (!credentialRef.current) {
        setBusy(false);
      }
    }, 5000);
  }, [error]);

  const clearCredential = useCallback(() => {
    setCredential(null);
    setCredentialError(null);
    credentialRef.current = null;
  }, []);

  // Cancel any active One Tap prompt — call this on component unmount and on
  // page navigation to prevent orphaned prompts.
  const cancelPrompt = useCallback(() => {
    if (!window.google?.accounts?.id) return;
    try {
      window.google.accounts.id.cancelPrompt();
    } catch {
      // BIS may not have an active prompt — silently ignore.
    }
  }, []);

  // Cleanup on unmount: cancel active prompts and clear any pending signIn timeout.
  const onUnmount = useCallback(() => {
    cancelPrompt();
    if (signInTimeoutRef.current !== null) {
      clearTimeout(signInTimeoutRef.current);
      signInTimeoutRef.current = null;
    }
  }, [cancelPrompt]);

  return {
    ready,
    error,
    busy,
    credential,
    credentialError,
    onCredentialCallback,
    renderButton,
    triggerPrompt,
    signIn,
    clearCredential,
    cancelPrompt,
    onUnmount,
  } as const;
}