import { useState, FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Mail, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { authAPI } from '@/api/tasks';

interface ForgotPasswordPageProps {
  onBack: () => void;
}

export default function ForgotPasswordPage({ onBack }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      await authAPI.forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send reset email. Please try again.');
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
          {sent ? (
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-500/10 mb-4"
              >
                <CheckCircle2 size={32} className="text-green-500" />
              </motion.div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Check your email</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                If an account exists for <strong>{email}</strong>, we've sent a password reset link. It expires in 30 minutes.
              </p>
              <button onClick={onBack} className="text-sm text-yellow-600 dark:text-yellow-400 hover:underline">
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-6 transition-colors">
                <ArrowLeft size={14} />
                Back to sign in
              </button>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Forgot password?</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Enter your email and we'll send you a reset link.
              </p>

              {error && (
                <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400" role="alert">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="input-field pl-9"
                      autoFocus
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Sending...
                    </>
                  ) : 'Send Reset Link'}
                </button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
