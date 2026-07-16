import { useState, FormEvent, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Mail, Lock, User, Eye, EyeOff, Loader2, XCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { authAPI } from '@/api/tasks';
import { GoogleButton } from '@/components/GoogleButton';
import PasswordStrengthBar from '@/components/ui/PasswordStrengthBar';
import { Input } from '@/components/ui/Input';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

type AuthMode = 'login' | 'register';

interface AuthPageProps {
  onForgotPassword?: () => void;
  onVerificationNeeded?: (email: string) => void;
}

export default function AuthPage({ onForgotPassword, onVerificationNeeded }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordFocused, setPasswordFocused] = useState(false);
  const { login, register, googleAuth } = useAuth();
  const nameRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const identifierRef = useRef<HTMLInputElement>(null);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'available' | 'taken' | 'typing'>('idle');
  const [usernameError, setUsernameError] = useState('');
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [capsLockOn, setCapsLockOn] = useState(false);

  useEffect(() => {
    setError('');
    setUsernameStatus('idle');
    setUsernameError('');

    setTimeout(() => {
      if (mode === 'register') {
        nameRef.current?.focus();
      } else {
        identifierRef.current?.focus();
      }
    }, 100);
  }, [mode]);

  const allPass = useMemo(() => {
    if (mode !== 'register') return true;
    return (
      password.length >= 8 &&
      /\d/.test(password) &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[^a-zA-Z0-9]/.test(password)
    );
  }, [password, mode]);

  const passwordsMatch = useMemo(() => {
    if (mode !== 'register') return true;
    return confirmPassword === password || confirmPassword.length === 0;
  }, [confirmPassword, password, mode]);

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setUsernameStatus('idle');
    setUsernameError('');

    if (usernameDebounceRef.current) {
      clearTimeout(usernameDebounceRef.current);
    }

    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setUsernameStatus('idle');
      setUsernameError('');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setUsernameStatus('idle');
      setUsernameError('Username can only contain letters, numbers, and underscores');
      return;
    }

    usernameDebounceRef.current = setTimeout(async () => {
      setUsernameStatus('typing');
      try {
        const { data } = await authAPI.checkUsername(trimmed);
        setUsernameStatus(data.available ? 'available' : 'taken');
        if (!data.available) {
          setUsernameError('This username is already taken');
        }
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
        setError('Full name is required');
        nameRef.current?.focus();
        return;
      }
      if (!username.trim()) {
        setError('Username is required');
        usernameRef.current?.focus();
        return;
      }
      if (usernameStatus === 'taken') {
        setError('Please choose a different username');
        usernameRef.current?.focus();
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
        setError('Username can only contain letters, numbers, and underscores');
        usernameRef.current?.focus();
        return;
      }
      if (!allPass) {
        setError('Password must be at least 8 characters with uppercase, lowercase, number, and special character');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    if (!identifier.trim()) {
      setError('Email or username is required');
      identifierRef.current?.focus();
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
      const msg = err.response?.data?.message || 'Something went wrong. Please try again.';
      const code = err.response?.data?.code;

      if (code === 'EMAIL_NOT_VERIFIED') {
        setError(msg);
        onVerificationNeeded?.(identifier);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
    setUsernameStatus('idle');
    setUsernameError('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setPasswordFocused(false);
  };

  const handleGoogleCredential = useCallback(async (credential: string) => {
    try {
      setGoogleLoading(true);
      setError('');
      await googleAuth(credential);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Google sign-in failed. Please try again.';
      setError(msg);
    } finally {
      setGoogleLoading(false);
    }
  }, [googleAuth]);

  const handleGoogleError = useCallback(() => {
    setError('Google Sign-In is unavailable. Please try again or use email/username.');
  }, []);

  const handleCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(e.getModifierState('CapsLock'));
  };

  const renderGoogleSection = () => {
    if (!GOOGLE_CLIENT_ID) {
      return null;
    }

    return (
      <div className="mt-6">
        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200 dark:border-gray-700" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white dark:bg-[#1a1a23] px-3 text-gray-500 dark:text-gray-400">or continue with</span>
          </div>
        </div>

        <GoogleButton
          clientId={GOOGLE_CLIENT_ID}
          onCredential={handleGoogleCredential}
          onError={handleGoogleError}
          label={mode === 'login' ? 'Sign in with Google' : 'Sign up with Google'}
          loading={googleLoading}
          disabled={googleLoading}
        />
      </div>
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA] dark:bg-[#0f0f13] p-4 py-8">
      <motion.div
        key={mode}
        variants={{
          hidden: { opacity: 0, y: 20 },
          visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
          exit: { opacity: 0, y: -20, transition: { duration: 0.2 } },
        }}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
            className="inline-flex items-center gap-2.5 mb-2"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-400 shadow-lg shadow-yellow-500/20">
              <Sparkles size={20} className="text-gray-900" />
            </div>
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">TaskFlow</span>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-sm text-gray-500 dark:text-gray-400"
          >
            {mode === 'login'
              ? 'Welcome back! Sign in to your workspace.'
              : 'Create your account to get started.'}
          </motion.p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#1a1a23] border border-gray-200 dark:border-gray-800 shadow-2xl shadow-gray-200/50 dark:shadow-black/50 p-6 sm:p-8">
          {/* Mode Switcher */}
          <div className="flex mb-6 bg-gray-100 dark:bg-gray-800/50 rounded-xl p-1">
            {(['login', 'register'] as AuthMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={switchMode}
                className={cn(
                  'flex-1 rounded-lg py-2.5 text-sm font-medium transition-all duration-200 relative overflow-hidden',
                  mode === m
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                {m === 'login' ? 'Sign In' : 'Sign Up'}
                {mode === m && (
                  <motion.div
                    layoutId="mode-pill"
                    className="absolute inset-0 rounded-lg bg-white dark:bg-gray-700"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="mb-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400 flex items-start gap-2"
              role="alert"
            >
              <XCircle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {mode === 'register' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-5"
              >
                {/* Full Name Input */}
                <div>
                  <Input
                    ref={nameRef}
                    label="Full Name"
                    placeholder="Your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    icon={<User size={18} />}
                    required
                    autoComplete="name"
                    error={error && !name.trim() ? 'Full name is required' : undefined}
                  />
                </div>

                {/* Username Input */}
                <div>
                  <Input
                    ref={usernameRef}
                    label="Username"
                    placeholder="Choose a unique username"
                    value={username}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    icon={<User size={18} />}
                    required
                    minLength={3}
                    maxLength={30}
                    autoComplete="username"
                    status={usernameStatus}
                    helperText={
                      usernameStatus === 'available' ? (
                        <span className="text-green-600 dark:text-green-400">✓ Username is available</span>
                      ) : usernameStatus === 'typing' ? (
                        'Checking availability...'
                      ) : undefined
                    }
                    error={usernameStatus === 'taken' ? usernameError : usernameError && usernameStatus === 'idle' ? usernameError : undefined}
                  />
                </div>
              </motion.div>
            )}

            {/* Email/Username Input */}
            <div>
              <Input
                ref={identifierRef}
                label={mode === 'login' ? 'Email or Username' : 'Email'}
                type={mode === 'login' ? 'text' : 'email'}
                placeholder={mode === 'login' ? 'you@example.com or username' : 'you@example.com'}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                icon={<Mail size={18} />}
                required
                autoComplete={mode === 'login' ? 'username' : 'email'}
                inputMode={mode === 'login' ? 'text' : 'email'}
                error={error && !identifier.trim() ? 'Email or username is required' : undefined}
              />
            </div>

            {/* Password Input */}
            <div>
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                onKeyUp={handleCapsLock}
                placeholder={mode === 'register' ? 'Minimum 8 characters' : 'Enter your password'}
                icon={<Lock size={18} />}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                aria-label={mode === 'login' ? 'Current password' : 'New password'}
                error={error && !password ? 'Password is required' : undefined}
                helperText={capsLockOn ? (
                  <span className="text-red-500 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-red-500" />
                    Caps Lock is ON
                  </span>
                ) : undefined}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-500/30"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />

              {/* Password Strength Bar */}
              {mode === 'register' && (passwordFocused || password.length > 0) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-2"
                >
                  <PasswordStrengthBar password={password} />
                </motion.div>
              )}
            </div>

            {/* Confirm Password Input */}
            {mode === 'register' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Input
                  label="Confirm Password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyUp={handleCapsLock}
                  placeholder="Repeat your password"
                  icon={<Lock size={18} />}
                  required
                  autoComplete="new-password"
                  aria-label="Confirm new password"
                  error={!passwordsMatch && confirmPassword.length > 0 ? 'Passwords do not match' : undefined}
                  helperText={capsLockOn ? (
                    <span className="text-red-500 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-red-500" />
                      Caps Lock is ON
                    </span>
                  ) : undefined}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-500/30"
                      tabIndex={-1}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  }
                />
                
                {/* Password Match Indicator */}
                {!passwordsMatch && confirmPassword.length > 0 && !error && (
                  <p className="mt-1 text-xs text-red-500 flex items-center gap-1 animate-shake" role="alert">
                    <XCircle size={12} className="shrink-0" />
                    Passwords do not match
                  </p>
                )}
              </motion.div>
            )}

            {/* Forgot Password */}
            {mode === 'login' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="text-sm font-medium transition-colors hover:text-yellow-500 dark:hover:text-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 rounded-lg px-2 py-1"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full flex items-center justify-center gap-2.5 rounded-xl px-4 py-3.5 text-sm font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 disabled:opacity-60 disabled:cursor-not-allowed',
                'bg-yellow-400 text-gray-900 hover:bg-yellow-500 hover:shadow-lg hover:shadow-yellow-500/20 active:bg-yellow-600 active:scale-[0.98]',
                'dark:bg-yellow-400 dark:text-gray-900 dark:hover:bg-yellow-500 dark:hover:shadow-yellow-500/20'
              )}
            >
              {loading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                </>
              ) : mode === 'login' ? (
                <>
                  <span>Sign In</span>
                </>
              ) : (
                <>
                  <span>Sign Up</span>
                </>
              )}
            </button>
          </form>

          {renderGoogleSection()}
        </div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400"
        >
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={switchMode}
            className="font-semibold text-yellow-500 hover:text-yellow-600 dark:text-yellow-400 dark:hover:text-yellow-300 transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500/30 rounded-lg px-1 py-0.5"
          >
            {mode === 'login' ? 'Create Account' : 'Sign In'}
          </button>
        </motion.p>
      </motion.div>
    </div>
  );
}
