import { useState, FormEvent, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Lock, Eye, EyeOff, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { authAPI } from '@/api/tasks';
import { toast } from 'sonner';
import PasswordStrengthBar from '@/components/ui/PasswordStrengthBar';
import api from '@/api/tasks';

interface ResetPasswordPageProps {
  token: string;
  onSuccess: () => void;
}

export default function ResetPasswordPage({ token, onSuccess }: ResetPasswordPageProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Missing reset token. Please request a new reset link.');
    }
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const { data } = await authAPI.resetPassword(token, password);
      if (data.accessToken && data.refreshToken) {
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
      }
      setDone(true);
      toast.success(data.message || 'Password reset successfully!');
      setTimeout(() => onSuccess(), 1500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid or expired reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA] dark:bg-[#0f0f13] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-400">
              <Sparkles size={20} className="text-gray-900" />
            </div>
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">TaskFlow</span>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#1a1a23] border border-gray-200 dark:border-gray-800 shadow-xl p-8">
          {done ? (
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-500/10 mb-4"
              >
                <CheckCircle2 size={32} className="text-green-500" />
              </motion.div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Password reset!</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Redirecting to your dashboard...</p>
            </div>
          ) : error && !token ? (
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-red-100 dark:bg-red-500/10 mb-4"
              >
                <XCircle size={32} className="text-red-500" />
              </motion.div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Invalid Request</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{error}</p>
              <button
                onClick={onSuccess}
                className="text-sm text-yellow-600 dark:text-yellow-400 hover:underline"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Set new password</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Enter your new password below. Must be at least 8 characters with uppercase, lowercase, number, and special character.
              </p>

              {error && (
                <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400" role="alert">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">New Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="input-field pl-9 pr-9"
                      autoFocus
                      required
                      minLength={8}
                      autoComplete="new-password"
                      aria-label="New password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {password.length > 0 && (
                    <div className="mt-2">
                      <PasswordStrengthBar password={password} />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Repeat new password"
                      className="input-field pl-9 pr-9"
                      required
                      autoComplete="new-password"
                      aria-label="Confirm new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      tabIndex={-1}
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    >
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {confirm && password !== confirm && (
                    <p className="mt-1 text-xs text-red-500" role="alert">Passwords do not match</p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Resetting...
                    </>
                  ) : 'Reset Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
