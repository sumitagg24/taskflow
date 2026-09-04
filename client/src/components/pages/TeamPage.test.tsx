import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import TeamPage from './TeamPage';

// Hoisted with the mock: `vi.mock` factories run before module-level consts.
const { growthAPI } = vi.hoisted(() => ({
  growthAPI: {
    get: vi.fn(),
    invite: vi.fn(),
    revokeInvite: vi.fn(),
  },
}));

vi.mock('@/api/tasks', () => ({ growthAPI }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const FREE_PLAN = {
  id: 'free' as const,
  name: 'Free',
  price: 0,
  blurb: 'Everything you need to run your own week.',
  features: ['Kanban, calendar and focus timer'],
  limits: {
    activeTasks: 100,
    templates: 3,
    savedViews: 3,
    aiRequestsPerDay: 20,
    attachmentsPerTask: 3,
  },
};

const PRO_PLAN = {
  ...FREE_PLAN,
  id: 'pro' as const,
  name: 'Pro',
  price: 8,
  blurb: 'For people who live in their task list.',
  features: ['Unlimited active tasks'],
  limits: { ...FREE_PLAN.limits, activeTasks: null },
};

const state = (overrides: Record<string, any> = {}) => ({
  plan: FREE_PLAN,
  plans: [FREE_PLAN, PRO_PLAN],
  usage: {
    activeTasks: { allowed: true, limit: 100, used: 42, remaining: 58 },
    templates: { allowed: true, limit: 3, used: 1, remaining: 2 },
  },
  referral: {
    code: 'ABCD2345',
    link: 'https://app.example.com/?ref=ABCD2345',
    credits: 2,
    maxCredits: 12,
    signups: 2,
  },
  invites: [],
  ...overrides,
});
const pendingInvite = (email: string) => ({
  email,
  invitedAt: new Date().toISOString(),
  acceptedAt: null,
  status: 'pending' as const,
});

const clipboard = { writeText: vi.fn() };

/** The plan heading only renders once the growth payload has landed. */
const loaded = (plan = 'Free') => screen.findByRole('heading', { level: 3, name: plan });

/**
 * Scopes a query to the invite list. Labels like "Pending" also appear in the
 * referral stats above it, so an unscoped getByText would match two nodes.
 */
const inviteList = () => within(screen.getByRole('list', { name: 'Sent invites' }));

/** Fills the invite field the way a controlled React input expects. */
const typeEmail = (value: string) =>
  fireEvent.change(screen.getByLabelText(/Email address/i), { target: { value } });

const sendInvite = () => fireEvent.click(screen.getByRole('button', { name: /Send invite/i }));

beforeEach(() => {
  vi.clearAllMocks();
  clipboard.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  growthAPI.get.mockResolvedValue({ data: state() });
});

describe('TeamPage — plan and usage', () => {
  it('shows the current plan with its usage against the limit', async () => {
    render(<TeamPage />);
    await loaded();

    expect(screen.getByText('42 / 100')).toBeInTheDocument();
    expect(screen.getByText('58 left')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Active tasks: 42 of 100 used' })
    ).toHaveAttribute('aria-valuenow', '42');
  });
  it('flags a limit that has been reached instead of showing a remaining count', async () => {
    growthAPI.get.mockResolvedValue({
      data: state({
        usage: {
          activeTasks: { allowed: false, limit: 100, used: 100, remaining: 0 },
          templates: { allowed: true, limit: 3, used: 0, remaining: 3 },
        },
      }),
    });
    render(<TeamPage />);

    expect(await screen.findByText(/Limit reached/i)).toBeInTheDocument();
    expect(screen.queryByText('0 left')).not.toBeInTheDocument();
  });

  it('renders an unlimited allowance without a meter', async () => {
    growthAPI.get.mockResolvedValue({
      data: state({
        plan: PRO_PLAN,
        usage: {
          activeTasks: { allowed: true, limit: null, used: 240, remaining: null },
          templates: { allowed: true, limit: 3, used: 1, remaining: 2 },
        },
      }),
    });
    render(<TeamPage />);
    await loaded('Pro');

    expect(screen.getByLabelText('unlimited')).toBeInTheDocument();
    expect(screen.getByText('240')).toBeInTheDocument();
    // Only the Templates meter remains.
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  it('only offers plans that cost more than the current one', async () => {
    render(<TeamPage />);
    await loaded();

    expect(screen.getByRole('heading', { level: 4, name: 'Pro' })).toBeInTheDocument();
    expect(screen.getByText('$8')).toBeInTheDocument();
  });

  it('offers no upgrade tiles on the top plan', async () => {
    growthAPI.get.mockResolvedValue({ data: state({ plan: PRO_PLAN }) });
    render(<TeamPage />);
    await loaded('Pro');

    expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument();
  });
});
describe('TeamPage — referral', () => {
  it('shows the link, the credit balance and the signup count', async () => {
    render(<TeamPage />);
    await loaded();

    expect(screen.getByText('https://app.example.com/?ref=ABCD2345')).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 12 months/)).toBeInTheDocument();
    expect(screen.getByText('Signups')).toBeInTheDocument();
  });

  it('copies the link to the clipboard', async () => {
    render(<TeamPage />);
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(clipboard.writeText).toHaveBeenCalledWith('https://app.example.com/?ref=ABCD2345');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('reports a clipboard failure rather than looking like a no-op', async () => {
    const { toast } = await import('sonner');
    clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    render(<TeamPage />);
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Copy failed — select the link and copy it manually')
    );
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });
});
describe('TeamPage — invites', () => {
  it('sends a normalised address and re-reads the list', async () => {
    growthAPI.invite.mockResolvedValue({ data: { delivered: true } });
    growthAPI.get
      .mockResolvedValueOnce({ data: state() })
      .mockResolvedValueOnce({ data: state({ invites: [pendingInvite('friend@example.com')] }) });

    render(<TeamPage />);
    await loaded();

    typeEmail('Friend@Example.com');
    sendInvite();

    await waitFor(() => expect(growthAPI.invite).toHaveBeenCalledWith('friend@example.com'));
    expect(await screen.findByText('friend@example.com')).toBeInTheDocument();
    expect(inviteList().getByText('Pending')).toBeInTheDocument();
    // The field is cleared so a second invite doesn't resend the first address.
    expect(screen.getByLabelText(/Email address/i)).toHaveValue('');
  });

  it('refuses to send a malformed address', async () => {
    const { toast } = await import('sonner');
    render(<TeamPage />);
    await loaded();

    typeEmail('nope');
    sendInvite();

    expect(growthAPI.invite).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Enter a valid email address');
  });

  it('surfaces the server message when an invite is rejected', async () => {
    const { toast } = await import('sonner');
    growthAPI.invite.mockRejectedValue({
      response: { data: { message: 'Daily invite limit reached — try again tomorrow' } },
    });
    render(<TeamPage />);
    await loaded();

    typeEmail('friend@example.com');
    sendInvite();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Daily invite limit reached — try again tomorrow')
    );
  });
  it('revokes a pending invite and drops it from the list', async () => {
    growthAPI.get.mockResolvedValue({
      data: state({ invites: [pendingInvite('pending@example.com')] }),
    });
    growthAPI.revokeInvite.mockResolvedValue({ data: {} });

    render(<TeamPage />);
    await screen.findByText('pending@example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Revoke invite to pending@example.com' }));

    expect(growthAPI.revokeInvite).toHaveBeenCalledWith('pending@example.com');
    await waitFor(() =>
      expect(screen.queryByText('pending@example.com')).not.toBeInTheDocument()
    );
  });

  it('offers no revoke control for an invite that was accepted', async () => {
    growthAPI.get.mockResolvedValue({
      data: state({
        invites: [
          {
            email: 'joined@example.com',
            invitedAt: new Date().toISOString(),
            acceptedAt: new Date().toISOString(),
            status: 'accepted',
          },
        ],
      }),
    });
    render(<TeamPage />);
    await screen.findByText('joined@example.com');

    expect(inviteList().getByText('Joined')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Revoke invite to joined@example.com/ })
    ).not.toBeInTheDocument();
  });

  it('shows an empty state with a copy-link fallback when nobody is invited', async () => {
    render(<TeamPage />);

    expect(await screen.findByText('No invites yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy referral link' })).toBeInTheDocument();
  });

  it('reports a failed load without rendering a broken page', async () => {
    const { toast } = await import('sonner');
    growthAPI.get.mockRejectedValue(new Error('offline'));
    render(<TeamPage />);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not load your invites'));
    // The page still stands up: header, invite form and empty state, no plan card.
    expect(screen.getByRole('heading', { name: 'Invite & grow' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send invite/i })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
