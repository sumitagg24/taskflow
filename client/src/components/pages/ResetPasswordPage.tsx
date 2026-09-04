import { useState, FormEvent } from 'react';
import { Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/Input';
import PasswordStrengthBar from '@/components/ui/PasswordStrengthBar';
import AuthShell from './auth/AuthShell';
import { PASSWORD_RULE_HINT, isStrongPassword } from './auth/password';
import {
  AuthAlert,
  AuthHeading,
  AuthLinkButton,
  AuthStatus,
  AuthSubmit,
  RevealToggle,
} from './auth/primitives';

const SHELL = {
  headline: 'One new password and you are back in.',
  points: [
    'The link works once, and only for 30 minutes',
    'We sign you straight in once it saves',
    'Every other session is signed out for safety',
  ],
} as const;

interface ResetPasswordPageProps {
  token: string;
  onSuccess: () => void;
}

export default function ResetPasswordPage({ token, onSuccess }: ResetPasswordPageProps) {
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const strong = isStrongPassword(password);
  const matches = confirm.length === 0 || confirm === password;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!strong) {
      setError(PASSWORD_RULE_HINT);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const message = await resetPassword(token, password);
      // Burn the spent token from the address bar in the same tick as the sign-in,
      // so the dashboard never paints with a used reset link still in history.
      window.history.replaceState({}, '', '/');
      setDone(true);
      toast.success(message);
    } catch (err: any) {
      setError(err.response?.data?.message || 'That reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  };

  // A link with no token can never work, so say so instead of showing a form.
  if (!token) {
    return (
      <AuthShell headline={SHELL.headline} points={SHELL.points}>
        <AuthStatus
          tone="error"
          icon={<ShieldAlert size={26} />}
          title="That link won't work"
          action={<AuthLinkButton onClick={onSuccess}>Back to sign in</AuthLinkButton>}
        >
          The reset link is missing its token. Ask for a fresh one from the sign-in page — they only
          stay valid for 30 minutes.
        </AuthStatus>
      </AuthShell>
    );
  }

  // Signing in flips the app to the dashboard, so this panel is really the
  // fallback for a server that reset the password without issuing a session.
  if (done) {
    return (
      <AuthShell headline={SHELL.headline} points={SHELL.points}>
        <AuthStatus
          tone="success"
          icon={<ShieldCheck size={26} />}
          title="Password updated"
          action={<AuthLinkButton onClick={onSuccess}>Continue</AuthLinkButton>}
        >
          Your new password is saved. Any other device that was signed in will need it too.
        </AuthStatus>
      </AuthShell>
    );
  }

  return (
    <AuthShell headline={SHELL.headline} points={SHELL.points}>
      <AuthHeading title="Set a new password." eyebrow="Password reset">
        {PASSWORD_RULE_HINT} Pick something you have not used here before.
      </AuthHeading>

      {error && <AuthAlert>{error}</AuthAlert>}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <Input
            label="New password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            icon={<Lock size={16} />}
            autoComplete="new-password"
            autoFocus
            required
            rightElement={
              <RevealToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
            }
          />
          {password.length > 0 && (
            <div className="pt-3">
              <PasswordStrengthBar password={password} />
            </div>
          )}
        </div>

        <Input
          label="Confirm password"
          type={showConfirm ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Type it once more"
          icon={<Lock size={16} />}
          autoComplete="new-password"
          required
          error={!matches ? 'These do not match.' : undefined}
          rightElement={
            <RevealToggle shown={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
          }
        />

        <div className="pt-2">
          <AuthSubmit
            loading={loading}
            loadingLabel="Saving…"
            disabled={!strong || password !== confirm}
          >
            Save new password
          </AuthSubmit>
        </div>
      </form>

      <p className="mt-7 text-[13px] leading-relaxed text-gray-500 dark:text-gray-500">
        Changed your mind?{' '}
        <AuthLinkButton onClick={onSuccess}>Go back to sign in</AuthLinkButton> — this link stays
        valid until it expires.
      </p>
    </AuthShell>
  );
}
