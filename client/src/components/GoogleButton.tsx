import { useEffect, useRef, useLayoutEffect } from 'react';
import { Mail } from 'lucide-react';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';

interface GoogleButtonProps {
  clientId: string | undefined;
  onCredential: (credential: string) => void;
  onError?: (error: string) => void;
  label?: string;
  loading?: boolean;
  disabled?: boolean;
}

export function GoogleButton({
  clientId,
  onCredential,
  onError,
  label = 'Sign in with Google',
  loading = false,
  disabled = false,
}: GoogleButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { ready, error, renderButton, onCredentialCallback, onUnmount } = useGoogleAuth(clientId);

  // Store renderButton in a ref to avoid dependency issues
  const renderButtonRef = useRef(renderButton);
  renderButtonRef.current = renderButton;

  // Register credential callback whenever it changes
  useEffect(() => {
    onCredentialCallback(onCredential);
  }, [onCredential, onCredentialCallback]);

  // Report error to parent
  useEffect(() => {
    if (error) {
      onError?.('Failed to initialize Google Sign-In');
    }
  }, [error, onError]);

  // Render button when ready state changes from false to true
  useEffect(() => {
    if (!ready || disabled || loading || !containerRef.current) return;
    renderButtonRef.current(containerRef.current);
  }, [ready, disabled, loading]);

  // useLayoutEffect runs synchronously after every mount — renders the button
  // immediately if ready is already true (e.g., on tab switch or StrictMode remount).
  useLayoutEffect(() => {
    if (!ready || disabled || loading || !containerRef.current) return;
    renderButtonRef.current(containerRef.current);
  }, [ready, disabled, loading]);

  // Unmount cleanup: cancel any active Google prompt and remove the container's
  // injected iframe.  Also triggers onUnmount which clears the signIn() hidden
  // container and its pending timeout.
  useEffect(() => {
    return () => {
      onUnmount();
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [onUnmount]);

  if (!clientId) {
    return null;
  }

  if (disabled || loading) {
    return (
      <div
        className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 transition-all duration-200 cursor-not-allowed"
        style={{ minHeight: '48px' }}
      >
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-400 rounded-full animate-spin" />
        {loading ? (label.toLowerCase().startsWith('sign up') ? 'Creating account...' : 'Signing in...') : 'Unavailable'}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300"
        style={{ minHeight: '48px' }}
      >
        <Mail size={18} className="text-gray-500" />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full [&>div]:!w-full [&_iframe]:!w-full"
      style={{ minHeight: '48px' }}
      data-testid="google-button-container"
    />
  );
}
