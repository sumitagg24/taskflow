import { useState, FormEvent, useRef, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Mail, Lock, User, AtSign, Gift } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { authAPI } from '@/api/tasks';
import { getReferralCode } from '@/lib/referral';
import PasswordStrengthBar from '@/components/ui/PasswordStrengthBar';
import { Input, UsernameInput } from '@/components/ui/Input';
import AuthShell from './auth/AuthShell';
import SocialAuth from './auth/SocialAuth';
import { PASSWORD_RULE_HINT, isStrongPassword } from './auth/password';
import { AuthAlert, AuthHeading, AuthSubmit, RevealToggle } from './auth/primitives';

type AuthMode = 'login' | 'register';
type UsernameStatus = 'idle' | 'available' | 'taken' | 'typing';

const COPY: Record<AuthMode, { title: string; sub: string; cta: string; busy: string; headline: string }> = {
  login: {
    title: 'Welcome back.',
    sub: 'Sign in and pick up exactly where you left off.',
    cta: 'Sign in',
    busy: 'Signing in…',
    headline: 'Plan the work, then work the plan.',
  },
  register: {
    title: 'Start your workspace.',
    sub: 'A minute to set up, and the busywork starts writing itself.',
    cta: 'Create account',
    busy: 'Creating account…',
    headline: 'A calm place for work that actually ships.',
  },
};

const MODES: readonly AuthMode[] = ['login', 'register'];

interface AuthPageProps {
  onForgotPassword?: () => void;
  onVerificationNeeded?: (email: string) => void;
}

export default function AuthPage({ onForgotPassword, onVerificationNeeded }: AuthPageProps) {
  // Somebody arriving on an invite link wants to sign up, not sign in.
  const referralCode = useMemo(() => getReferralCode(), []);
  const [mode, setMode] = useState<AuthMode>(referralCode ? 'register' : 'login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameError, setUsernameError] = useState('');

  const { login, register, googleAuth } = useAuth();
  const nameRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const identifierRef = useRef<HTMLInputElement>(null);
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const copy = COPY[mode];

  useEffect(() => {
    setError('');
    setUsernameStatus('idle');
    setUsernameError('');

    const id = window.setTimeout(() => {
      (mode === 'register' ? nameRef : identifierRef).current?.focus();
    }, 120);
    return () => window.clearTimeout(id);
  }, [mode]);

  useEffect(
    () => () => {
      if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    },
    []
  );
  const allPass = useMemo(
    () => (mode === 'register' ? isStrongPassword(password) : true),
    [password, mode]
  );

  const passwordsMatch = useMemo(() => {
    if (mode !== 'register') return true;
    return confirmPassword === password || confirmPassword.length === 0;
  }, [confirmPassword, password, mode]);

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setUsernameStatus('idle');
    setUsernameError('');

    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);

    const trimmed = value.trim();
    if (trimmed.length < 3) return;

    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setUsernameError('Letters, numbers and underscores only.');
      return;
    }

    usernameDebounceRef.current = setTimeout(async () => {
      setUsernameStatus('typing');
      try {
        const { data } = await authAPI.checkUsername(trimmed);
        setUsernameStatus(data.available ? 'available' : 'taken');
        if (!data.available) setUsernameError('That username is taken.');
      } catch {
        setUsernameStatus('idle');
      }
    }, 500);
  };
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'register') {
      if (!name.trim()) {
        setError('Your name is required.');
        nameRef.current?.focus();
        return;
      }
      if (!username.trim()) {
        setError('Pick a username.');
        usernameRef.current?.focus();
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
        setError('Usernames can only contain letters, numbers and underscores.');
        usernameRef.current?.focus();
        return;
      }
      if (usernameStatus === 'taken') {
        setError('That username is taken — try another.');
        usernameRef.current?.focus();
        return;
      }
      if (!allPass) {
        setError(PASSWORD_RULE_HINT);
        return;
      }
      if (password !== confirmPassword) {
        setError('The two passwords do not match.');
        return;
      }
    }

    if (!identifier.trim()) {
      setError(mode === 'login' ? 'Enter your email or username.' : 'Enter your email address.');
      identifierRef.current?.focus();
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(identifier, password);
      } else {
        await register(name, username, identifier, password);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
      if (err.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        onVerificationNeeded?.(identifier);
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next: AuthMode) => {
    if (next === mode) return;
    setMode(next);
    setError('');
    setUsernameStatus('idle');
    setUsernameError('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setPasswordFocused(false);
    setCapsLockOn(false);
  };

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setSocialLoading(true);
      setError('');
      try {
        await googleAuth(credential);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Google sign-in failed. Please try again.');
      } finally {
        setSocialLoading(false);
      }
    },
    [googleAuth]
  );

  const handleSocialError = useCallback((message: string) => setError(message), []);
  const capsHint = capsLockOn ? (
    <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
      <span className="h-1 w-1 rounded-full bg-current" />
      Caps Lock is on
    </span>
  ) : undefined;

  return (
    <AuthShell headline={copy.headline}>
      {/* Mode switch — a hairline segmented control, not a slab of chrome. */}
      <div
        role="tablist"
        aria-label="Sign in or create an account"
        className="mb-8 inline-flex rounded-lg border border-hairline bg-surface p-1"
      >
        {MODES.map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={cn(
              'relative rounded-[6px] px-4 py-1.5 text-[13px] font-medium transition-colors duration-200',
              'focus:outline-none focus-visible:ring-[3px] focus-visible:ring-clay/25',
              mode === m
                ? 'text-gray-900 dark:text-gray-50'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            {mode === m && (
              <motion.span
                layoutId="auth-mode-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-[6px] bg-card shadow-sm"
              />
            )}
            <span className="relative">{m === 'login' ? 'Sign in' : 'Sign up'}</span>
          </button>
        ))}
      </div>
      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <AuthHeading title={copy.title}>{copy.sub}</AuthHeading>

        {/* Referral attribution — reassure the invitee their link worked. */}
        {referralCode && mode === 'register' && (
          <div
            role="status"
            className="mb-5 flex items-start gap-2.5 rounded-lg border border-yellow-200 bg-yellow-50/80 px-3.5 py-3 text-[13px] leading-snug text-yellow-800 dark:border-yellow-500/25 dark:bg-yellow-500/10 dark:text-yellow-200"
          >
            <Gift size={16} className="mt-px shrink-0" aria-hidden="true" />
            <span>
              You were invited. Your code{' '}
              <span className="font-mono font-semibold">{referralCode}</span> is applied when you
              sign up.
            </span>
          </div>
        )}

        <AnimatePresence>{error && <AuthAlert key={error}>{error}</AuthAlert>}</AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {mode === 'register' && (
            <>
              <Input
                ref={nameRef}
                label="Your name"
                placeholder="Ada Lovelace"
                value={name}
                onChange={(e) => setName(e.target.value)}
                icon={<User size={16} />}
                autoComplete="name"
                required
              />
              <UsernameInput
                ref={usernameRef}
                label="Username"
                placeholder="ada"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                minLength={3}
                maxLength={30}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                status={usernameStatus}
                required
                error={usernameError || undefined}
                helperText={
                  usernameStatus === 'available'
                    ? 'That one is free.'
                    : usernameStatus === 'typing'
                      ? 'Checking…'
                      : undefined
                }
              />
            </>
          )}
          <Input
            ref={identifierRef}
            label={mode === 'login' ? 'Email or username' : 'Email'}
            type={mode === 'login' ? 'text' : 'email'}
            placeholder={mode === 'login' ? 'you@example.com or ada' : 'you@example.com'}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            icon={mode === 'login' ? <AtSign size={16} /> : <Mail size={16} />}
            autoComplete={mode === 'login' ? 'username' : 'email'}
            inputMode={mode === 'login' ? 'text' : 'email'}
            autoCapitalize="none"
            spellCheck={false}
            required
          />

          <div>
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              onKeyUp={(e) => setCapsLockOn(e.getModifierState('CapsLock'))}
              placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
              icon={<Lock size={16} />}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              helperText={capsHint}
              rightElement={
                <RevealToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
              }
            />

            <AnimatePresence>
              {mode === 'register' && (passwordFocused || password.length > 0) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="pt-3">
                    <PasswordStrengthBar password={password} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {mode === 'register' && (
            <Input
              label="Confirm password"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyUp={(e) => setCapsLockOn(e.getModifierState('CapsLock'))}
              placeholder="Type it once more"
              icon={<Lock size={16} />}
              autoComplete="new-password"
              required
              error={!passwordsMatch ? 'These do not match.' : undefined}
              helperText={passwordsMatch ? capsHint : undefined}
              rightElement={
                <RevealToggle
                  shown={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((v) => !v)}
                />
              }
            />
          )}

          {mode === 'login' && (
            <div className="flex justify-end pt-0.5">
              <button
                type="button"
                onClick={onForgotPassword}
                className="rounded-sm text-[13px] text-gray-500 transition-colors hover:text-clay focus:outline-none focus-visible:ring-[3px] focus-visible:ring-clay/25 dark:text-gray-400"
              >
                Forgot your password?
              </button>
            </div>
          )}

          <div className="pt-2">
            <AuthSubmit loading={loading} loadingLabel={copy.busy} disabled={socialLoading}>
              {copy.cta}
            </AuthSubmit>
          </div>
        </form>
        <SocialAuth
          mode={mode}
          onGoogleCredential={handleGoogleCredential}
          onError={handleSocialError}
          busy={loading || socialLoading}
        />

        <p className="mt-8 text-[13px] text-gray-500 dark:text-gray-400">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            className="rounded-sm font-medium text-clay underline decoration-clay/30 decoration-1 underline-offset-[3px] transition-colors hover:decoration-clay focus:outline-none focus-visible:ring-[3px] focus-visible:ring-clay/25"
          >
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </motion.div>
    </AuthShell>
  );
}
