import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Check,
  Copy,
  Gift,
  Link2,
  Mail,
  RotateCcw,
  Send,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { growthAPI, type GrowthState, type Invite } from '@/api/tasks';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { EmptyState, LoadingRegion, Skeleton } from '../ui/Feedback';
import { PlanCard } from '../widgets/PlanCard';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const relativeDay = (iso: string) => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function TeamPage() {
  const [state, setState] = useState<GrowthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await growthAPI.get();
      setState(data);
    } catch {
      toast.error('Could not load your invites');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The clipboard API is unavailable on http origins and inside some webviews,
  // so fall back to a selectable prompt rather than silently doing nothing.
  const copyLink = async () => {
    if (!state) return;
    try {
      await navigator.clipboard.writeText(state.referral.link);
      setCopied(true);
      toast.success('Referral link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed — select the link and copy it manually');
    }
  };

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = email.trim().toLowerCase();
    if (!EMAIL_RE.test(raw)) {
      toast.error('Enter a valid email address');
      return;
    }
    setSending(true);
    try {
      const { data } = await growthAPI.invite(raw);
      setEmail('');
      // Re-read rather than splicing locally: the daily cap and accepted state
      // both live server-side.
      await load();
      toast.success(
        data?.delivered ? `Invite sent to ${raw}` : 'Invite saved, but the email bounced'
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not send that invite');
    } finally {
      setSending(false);
    }
  };

  const revoke = async (invite: Invite) => {
    setRevoking(invite.email);
    try {
      await growthAPI.revokeInvite(invite.email);
      setState((prev) =>
        prev ? { ...prev, invites: prev.invites.filter((i) => i.email !== invite.email) } : prev
      );
      toast.success('Invite revoked');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not revoke that invite');
    } finally {
      setRevoking(null);
    }
  };

  const pending = useMemo(
    () => (state?.invites || []).filter((i) => i.status === 'pending').length,
    [state]
  );
  const accepted = useMemo(
    () => (state?.invites || []).filter((i) => i.status === 'accepted').length,
    [state]
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-4 lg:p-6">
        <LoadingRegion label="Loading your plan and invites">
          <Skeleton className="h-8 w-40" />
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-24" rounded="lg" />
            <Skeleton className="h-24" rounded="lg" />
            <Skeleton className="h-24" rounded="lg" />
          </div>
          <Skeleton className="mt-4 h-48" rounded="lg" />
        </LoadingRegion>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-4xl space-y-5 p-4 lg:p-6"
    >
      <header className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-50 text-yellow-700 dark:bg-yellow-500/12 dark:text-yellow-300"
        >
          <Users size={20} />
        </span>
        <div>
          <h2 className="font-display text-xl text-gray-900 dark:text-gray-100">Invite &amp; grow</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Share TaskFlow, earn Pro months, and track your plan usage.
          </p>
        </div>
      </header>

      {state && <PlanCard growth={state} onRefresh={load} />}

      {state && (
        <Card padding="lg">
          <CardHeader
            eyebrow="Referral"
            title="Your invite link"
            subtitle={`Every signup earns you a free month of Pro, up to ${state.referral.maxCredits}.`}
            action={
              <Badge variant="primary" className="gap-1.5">
                <Gift size={12} aria-hidden="true" />
                {state.referral.credits} / {state.referral.maxCredits} months
              </Badge>
            }
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="border-hairline flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-surface px-3 py-2.5">
              <Link2 size={14} className="shrink-0 text-gray-400" aria-hidden="true" />
              <span className="truncate font-mono text-xs text-gray-700 dark:text-gray-300">
                {state.referral.link}
              </span>
            </div>
            {/* No aria-label: the visible text is the better accessible name, and
                the empty state below already owns "Copy referral link". */}
            <Button
              variant={copied ? 'secondary' : 'primary'}
              onClick={copyLink}
              icon={copied ? <Check size={14} /> : <Copy size={14} />}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-3">
            {[
              { label: 'Signups', value: state.referral.signups, icon: <TrendingUp size={13} /> },
              { label: 'Pending', value: pending, icon: <Mail size={13} /> },
              { label: 'Accepted', value: accepted, icon: <Check size={13} /> },
            ].map((s) => (
              <div key={s.label} className="border-hairline rounded-lg border bg-surface p-3">
                <dt className="caption-upper flex items-center gap-1.5">
                  <span aria-hidden="true" className="text-gray-400">
                    {s.icon}
                  </span>
                  {s.label}
                </dt>
                <dd className="font-display mt-1 text-2xl leading-none text-gray-900 dark:text-gray-50">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>

          {state.referral.credits > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-yellow-50 p-3 text-xs text-yellow-900 dark:bg-yellow-500/10 dark:text-yellow-200">
              <Sparkles size={14} className="mt-px shrink-0" aria-hidden="true" />
              <p>
                You&apos;ve banked <strong>{state.referral.credits}</strong> month
                {state.referral.credits === 1 ? '' : 's'} of Pro. They apply automatically when
                billing goes live.
              </p>
            </div>
          )}
        </Card>
      )}

      <Card padding="lg">
        <CardHeader
          eyebrow="Invites"
          title="Invite by email"
          subtitle="We send them your referral link. They land on a normal signup, already attributed to you."
        />

        {/* noValidate: the native email bubble would preempt our own toast, and
            the rest of the app reports validation the same way. */}
        <form
          onSubmit={submitInvite}
          className="flex flex-col gap-2 sm:flex-row sm:items-start"
          noValidate
        >
          <Input
            type="email"
            label="Email address"
            wrapperClassName="flex-1"
            placeholder="teammate@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={sending}
          />
          <Button
            type="submit"
            loading={sending}
            disabled={!email.trim()}
            icon={<Send size={14} />}
            className="sm:mt-[26px]"
          >
            Send invite
          </Button>
        </form>

        <div className="mt-5">
          {state && state.invites.length > 0 ? (
            <ul
              aria-label="Sent invites"
              className="border-hairline divide-y divide-[var(--border-color)] overflow-hidden rounded-lg border"
            >
              {state.invites.map((invite) => (
                <li
                  key={invite.email}
                  className="flex items-center gap-3 bg-surface px-3.5 py-2.5 text-sm"
                >
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-gray-400 dark:text-gray-500"
                  >
                    {invite.status === 'accepted' ? <Check size={15} /> : <Mail size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-gray-800 dark:text-gray-200">{invite.email}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {invite.status === 'accepted'
                        ? `Joined ${relativeDay(invite.acceptedAt as string)}`
                        : `Invited ${relativeDay(invite.invitedAt)}`}
                    </p>
                  </div>
                  <Badge variant={invite.status === 'accepted' ? 'success' : 'muted'}>
                    {invite.status === 'accepted' ? 'Joined' : 'Pending'}
                  </Badge>
                  {invite.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={revoking === invite.email}
                      onClick={() => revoke(invite)}
                      icon={<X size={13} />}
                      aria-label={`Revoke invite to ${invite.email}`}
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              size="sm"
              icon={<UserPlus size={20} />}
              title="No invites yet"
              description="Invite someone above, or share your referral link directly."
              action={
                state && (
                  <Button variant="secondary" size="sm" onClick={copyLink} icon={<Copy size={13} />}>
                    Copy referral link
                  </Button>
                )
              }
            />
          )}
        </div>

        {state && state.invites.length > 0 && (
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              {pending} pending · {accepted} joined
            </span>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 hover:text-gray-800 dark:hover:text-gray-200"
            >
              <RotateCcw size={12} aria-hidden="true" />
              Refresh
            </button>
          </div>
        )}
      </Card>

      <Card padding="lg" variant="quiet">
        <CardHeader
          eyebrow="Roadmap"
          title="Shared workspaces"
          subtitle="Invites reserve a seat today. Shared boards, assignees and a team digest land next."
        />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {['Shared boards', 'Member roles', 'Team digest'].map((title) => (
            <div
              key={title}
              className="border-hairline flex items-center gap-2 rounded-lg border bg-surface p-3"
            >
              <Sparkles size={14} className="shrink-0 text-yellow-600 dark:text-yellow-400" aria-hidden="true" />
              <span className="text-sm text-gray-700 dark:text-gray-300">{title}</span>
              <span className="caption-upper ml-auto">Soon</span>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}

// PlanCard is intentionally a separate widget so the Settings page and the
// task-limit prompt can reuse the same plan/usage rendering.
