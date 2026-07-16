import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface VerifyEmailPageProps {
  token: string;
  onSuccess: () => void;
}

export default function VerifyEmailPage({ token, onSuccess }: VerifyEmailPageProps) {
  const { verifyEmail } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const hasVerified = useRef(false);

  useEffect(() => {
    const verify = async () => {
      if (hasVerified.current) return;
      hasVerified.current = true;

      if (!token) {
        setStatus('error');
        setMessage('Verification token is missing. Please check your email link or request a new verification email.');
        return;
      }

      try {
        await verifyEmail(token);
        setStatus('success');
        setMessage('Email verified successfully!');
        setTimeout(() => {
          onSuccess();
        }, 2000);
      } catch (err: any) {
        setStatus('error');
        const errorMessage = err.response?.data?.message;
        if (errorMessage) {
          setMessage(errorMessage);
        } else if (err.message) {
          setMessage(err.message);
        } else {
          setMessage('Failed to verify email. The link may have expired. Please request a new verification email.');
        }
      }
    };
    verify();
  }, [token, verifyEmail, onSuccess]);

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

        <div className="rounded-2xl bg-white dark:bg-[#1a1a23] border border-gray-200 dark:border-gray-800 shadow-xl p-8 text-center">
          {status === 'loading' && (
            <div className="py-8">
              <Loader2 size={40} className="animate-spin text-yellow-500 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">Verifying your email...</p>
            </div>
          )}

          {status === 'success' && (
            <div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-500/10 mb-4"
              >
                <CheckCircle2 size={32} className="text-green-500" />
              </motion.div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Email Verified!</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Redirecting to sign in...</p>
            </div>
          )}

          {status === 'error' && (
            <div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-red-100 dark:bg-red-500/10 mb-4"
              >
                <XCircle size={32} className="text-red-500" />
              </motion.div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Verification Failed</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{message}</p>
              <button
                onClick={onSuccess}
                className="text-sm text-yellow-600 dark:text-yellow-400 hover:underline"
              >
                Back to sign in
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
