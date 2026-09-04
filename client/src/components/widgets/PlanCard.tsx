import { useMemo } from 'react';
import { ArrowUpRight, Check, Crown, Infinity as InfinityIcon, Zap } from 'lucide-react';
import type { GrowthState, Plan, UsageCheck } from '@/api/tasks';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Progress } from '../ui/Progress';
import { cn } from '@/lib/utils';

/**
 * Plan + live usage, rendered from the same payload the server enforces against.
 * A `limit` of null is unlimited and gets a glyph instead of a meter — a full or
 * empty bar would both be a lie.
 */

const PLAN_ICONS: Record<string, typeof Zap> = {
  free: Zap,
  pro: Crown,
  team: Crown,
};

function UsageMeter({ label, usage }: { label: string; usage: UsageCheck }) {
  if (usage.limit === null) {
    return (
      <div className="border-hairline rounded-lg border bg-surface p-3">
        <p className="caption-upper">{label}</p>
        <div className="mt-1.5 flex items-center gap-1.5 text-gray-900 dark:text-gray-100">
          <span className="font-display text-2xl leading-none">{usage.used}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            of <InfinityIcon size={13} className="inline align-[-2px]" aria-label="unlimited" />
          </span>
        </div>
      </div>
    );
  }

  const pct = usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  // Amber at 80% is the warning the user can still act on; red is the wall.
  const tone = !usage.allowed ? 'danger' : pct >= 80 ? 'warning' : 'accent';

  return (
    <div className="border-hairline rounded-lg border bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="caption-upper">{label}</p>
        <p
          className={cn(
            'text-xs font-medium',
            tone === 'danger'
              ? 'text-red-600 dark:text-red-400'
              : tone === 'warning'
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-gray-500 dark:text-gray-400'
          )}
        >
          {usage.used} / {usage.limit}
        </p>
      </div>
      <Progress
        value={pct}
        tone={tone}
        size="xs"
        className="mt-2.5"
        ariaLabel={`${label}: ${usage.used} of ${usage.limit} used`}
      />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        {usage.allowed
          ? `${usage.remaining} left`
          : 'Limit reached — complete or delete a few, or upgrade'}
      </p>
    </div>
  );
}

export function PlanCard({
  growth,
  onRefresh,
  compact,
}: {
  growth: GrowthState;
  onRefresh?: () => void;
  compact?: boolean;
}) {
  const Icon = PLAN_ICONS[growth.plan.id] || Zap;
  const upgrades = useMemo(
    () => growth.plans.filter((p) => p.price > growth.plan.price),
    [growth.plans, growth.plan.price]
  );

  return (
    <Card padding="lg">
      <CardHeader
        eyebrow="Plan"
        title={
          <span className="flex items-center gap-2">
            <Icon size={17} className="text-yellow-600 dark:text-yellow-400" aria-hidden="true" />
            {growth.plan.name}
          </span>
        }
        subtitle={growth.plan.blurb}
        action={
          <Badge variant={growth.plan.id === 'free' ? 'muted' : 'primary'}>
            {growth.plan.price === 0 ? 'Free' : `$${growth.plan.price}/mo`}
          </Badge>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <UsageMeter label="Active tasks" usage={growth.usage.activeTasks} />
        <UsageMeter label="Templates" usage={growth.usage.templates} />
      </div>

      {!compact && upgrades.length > 0 && (
        <div className="mt-5">
          <p className="caption-upper mb-2.5">Upgrade</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {upgrades.map((plan) => (
              <UpgradeTile key={plan.id} plan={plan} />
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Billing isn&apos;t live yet — referral credits bank against your first invoice.
          </p>
        </div>
      )}

      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="mt-4 text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Refresh usage
        </button>
      )}
    </Card>
  );
}

function UpgradeTile({ plan }: { plan: Plan }) {
  return (
    <div className="border-hairline flex flex-col rounded-lg border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-display text-base text-gray-900 dark:text-gray-100">{plan.name}</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <span className="font-display text-lg text-gray-900 dark:text-gray-100">
            ${plan.price}
          </span>
          /mo
        </p>
      </div>
      {plan.blurb && (
        <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{plan.blurb}</p>
      )}
      <ul className="mt-3 flex-1 space-y-1.5">
        {(plan.features || []).map((f) => (
          <li key={f} className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <Check
              size={13}
              className="mt-px shrink-0 text-green-600 dark:text-green-400"
              aria-hidden="true"
            />
            {f}
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        size="sm"
        className="mt-4"
        fullWidth
        iconRight={<ArrowUpRight size={13} />}
        disabled
        title="Billing is not live yet"
      >
        Coming soon
      </Button>
    </div>
  );
}
