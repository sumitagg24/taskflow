import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Flame, Target, TrendingUp, Timer, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getInsights } from '@/api/tasks';
import {
  Card, CardHeader, StatCard, SegmentedControl, EmptyState,
  SkeletonCard, LoadingRegion, Progress, ProgressRing, Badge,
} from '@/components/ui';
import { cn } from '@/lib/utils';

interface Insights {
  range: { days: number; from: string; to: string };
  score: {
    value: number;
    grade: string;
    components: { completionRate: number; onTimeRate: number; momentum: number; consistency: number };
  };
  streak: { current: number; longest: number; todayDone: boolean };
  velocity: { date: string; created: number; completed: number }[];
  burndown: { date: string; remaining: number }[];
  throughput: { completed: number; created: number; net: number; last7: number; prev7: number };
  time: {
    spentTotal: number;
    trackedCount: number;
    estimatedTotal: number;
    spentOnEstimated: number;
    accuracy: number | null;
    byCategory: { category: string; minutes: number }[];
  };
  backlog: {
    open: number;
    overdue: number;
    oldestOverdueDays: number;
    byPriority: { priority: string; count: number }[];
  };
}

const RANGES = [
  { id: '7', label: '7d' },
  { id: '30', label: '30d' },
  { id: '90', label: '90d' },
];

function formatMinutes(min: number): string {
  if (!min) return '0m';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const PRIORITY_TONE: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-400',
  none: 'bg-gray-300 dark:bg-gray-600',
};

export default function InsightsPage() {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('30');

  const load = useCallback(async (days: number) => {
    setLoading(true);
    try {
      const res = await getInsights(days);
      setData(res.data);
    } catch {
      toast.error('Could not load insights');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(Number(range));
  }, [range, load]);

  const maxVelocity = data
    ? Math.max(1, ...data.velocity.map((d) => Math.max(d.created, d.completed)))
    : 1;
  const maxBurndown = data ? Math.max(1, ...data.burndown.map((d) => d.remaining)) : 1;

  return (
    <div className="animate-fadeIn p-4 lg:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-gray-900 dark:text-gray-100">Insights</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            How your work is actually moving — not just what&apos;s on the list.
          </p>
        </div>
        <SegmentedControl
          items={RANGES}
          value={range}
          onChange={setRange}
          aria-label="Time range"
        />
      </div>

      {loading && !data ? (
        <LoadingRegion label="Loading insights">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
        </LoadingRegion>
      ) : !data ? (
        <EmptyState
          icon={<TrendingUp size={22} />}
          title="No insights yet"
          description="Complete a few tasks and this page fills in with your score, streak and velocity."
        />
      ) : (
        <div className={cn('space-y-5', loading && 'opacity-60 transition-opacity')} aria-busy={loading}>
          {/* Headline row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card padding="md" className="flex items-center gap-4">
              <ProgressRing
                value={data.score.value}
                size={68}
                tone="accent"
                label={`Productivity score ${data.score.value} out of 100`}
              />
              <div className="min-w-0">
                <p className="caption-upper text-gray-500 dark:text-gray-400">Productivity</p>
                <p className="font-display text-2xl leading-tight text-gray-900 dark:text-gray-100">
                  {data.score.grade}
                </p>
              </div>
            </Card>

            <StatCard
              label="Current streak"
              value={`${data.streak.current} ${data.streak.current === 1 ? 'day' : 'days'}`}
              icon={<Flame size={16} />}
              hint={
                data.streak.todayDone
                  ? `Longest ${data.streak.longest}d — today counted`
                  : `Longest ${data.streak.longest}d — nothing finished today`
              }
            />

            <StatCard
              label="Completed"
              value={data.throughput.completed}
              icon={<CheckCircle2 size={16} />}
              delta={
                data.throughput.prev7 === 0
                  ? undefined
                  : Math.round(((data.throughput.last7 - data.throughput.prev7) / data.throughput.prev7) * 100)
              }
              hint={`${data.throughput.last7} in the last 7 days`}
            />

            <StatCard
              label="Time tracked"
              value={formatMinutes(data.time.spentTotal)}
              icon={<Timer size={16} />}
              hint={`across ${data.time.trackedCount} task${data.time.trackedCount === 1 ? '' : 's'}`}
            />
          </div>

          {/* Score components */}
          <Card padding="md">
            <CardHeader
              eyebrow="Score breakdown"
              title={`${data.score.value} / 100`}
              subtitle="Completion 40% · On-time 25% · Momentum 20% · Consistency 15%"
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {([
                ['Completion', data.score.components.completionRate, 'How much of your list you finish'],
                ['On time', data.score.components.onTimeRate, 'Finished before the due date'],
                ['Momentum', data.score.components.momentum, 'This week vs last week'],
                ['Consistency', data.score.components.consistency, 'Days you shipped something'],
              ] as const).map(([label, value, hint]) => (
                <div key={label}>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
                    <span className="font-display text-lg text-gray-900 dark:text-gray-100">{value}%</span>
                  </div>
                  <Progress
                    value={value}
                    tone={value >= 70 ? 'success' : value >= 40 ? 'accent' : 'warning'}
                  />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Velocity */}
          <Card padding="md">
            <CardHeader
              eyebrow="Velocity"
              title="Created vs completed"
              subtitle={`${shortDate(data.range.from)} — ${shortDate(data.range.to)}`}
              action={
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-yellow-400" aria-hidden="true" /> Completed
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden="true" /> Created
                  </span>
                </div>
              }
            />
            <div className="mt-5 flex h-40 items-end gap-[3px]" role="img"
              aria-label={`Velocity chart: ${data.throughput.completed} completed and ${data.throughput.created} created over ${data.range.days} days`}>
              {data.velocity.map((d) => (
                <div key={d.date} className="group relative flex flex-1 flex-col justify-end gap-[2px]">
                  <div
                    className="w-full rounded-t-sm bg-yellow-400 transition-all"
                    style={{ height: `${(d.completed / maxVelocity) * 100}%` }}
                  />
                  <div
                    className="w-full rounded-t-sm bg-gray-200 transition-all dark:bg-gray-700"
                    style={{ height: `${(d.created / maxVelocity) * 55}%` }}
                  />
                  <span className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 rounded-md border border-gray-200 bg-card px-2 py-1 text-[11px] whitespace-nowrap text-gray-700 shadow-md group-hover:block dark:border-gray-700 dark:text-gray-200">
                    {shortDate(d.date)}: {d.completed} done, {d.created} new
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Burndown */}
            <Card padding="md">
              <CardHeader
                eyebrow="Burndown"
                title="Open tasks over time"
                subtitle={data.throughput.net > 0
                  ? `Backlog grew by ${data.throughput.net} this period`
                  : data.throughput.net < 0
                    ? `Backlog shrank by ${Math.abs(data.throughput.net)} this period`
                    : 'Backlog held flat this period'}
              />
              <div className="mt-5 flex h-32 items-end gap-[3px]" role="img"
                aria-label={`Burndown chart ending at ${data.backlog.open} open tasks`}>
                {data.burndown.map((d) => (
                  <div key={d.date} className="group relative flex flex-1 items-end">
                    <div
                      className="w-full rounded-t-sm bg-clay/25 transition-all group-hover:bg-clay/45"
                      style={{ height: `${Math.max((d.remaining / maxBurndown) * 100, 2)}%` }}
                    />
                    <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 rounded-md border border-gray-200 bg-card px-2 py-1 text-[11px] whitespace-nowrap text-gray-700 shadow-md group-hover:block dark:border-gray-700 dark:text-gray-200">
                      {shortDate(d.date)}: {d.remaining} open
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Backlog health */}
            <Card padding="md">
              <CardHeader
                eyebrow="Backlog"
                title={`${data.backlog.open} open`}
                subtitle={data.backlog.overdue > 0
                  ? `${data.backlog.overdue} overdue — oldest by ${data.backlog.oldestOverdueDays}d`
                  : 'Nothing overdue'}
                action={data.backlog.overdue > 0 ? (
                  <Badge variant="danger">
                    <AlertTriangle size={12} aria-hidden="true" />
                    {data.backlog.overdue} overdue
                  </Badge>
                ) : (
                  <Badge variant="success">On top of it</Badge>
                )}
              />
              <ul className="mt-4 space-y-2.5">
                {data.backlog.byPriority.map(({ priority, count }) => (
                  <li key={priority} className="flex items-center gap-3">
                    <span className="w-16 text-xs capitalize text-gray-500 dark:text-gray-400">{priority}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className={cn('h-full rounded-full transition-all', PRIORITY_TONE[priority])}
                        style={{ width: `${data.backlog.open ? (count / data.backlog.open) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs font-medium text-gray-700 dark:text-gray-300">{count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Time report */}
          <Card padding="md">
            <CardHeader
              eyebrow="Time report"
              title="Estimates vs actuals"
              subtitle={
                data.time.accuracy === null
                  ? 'Add estimates to completed tasks to see how close your guesses are.'
                  : data.time.accuracy > 110
                    ? `Work runs ${data.time.accuracy - 100}% longer than you estimate`
                    : data.time.accuracy < 90
                      ? `Work finishes ${100 - data.time.accuracy}% faster than you estimate`
                      : 'Your estimates are landing within 10%'
              }
              action={data.time.accuracy !== null && (
                <Badge variant={data.time.accuracy > 130 ? 'warning' : 'info'}>
                  {data.time.accuracy}% of estimate
                </Badge>
              )}
            />

            {data.time.accuracy !== null && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="caption-upper text-gray-500 dark:text-gray-400">Estimated</p>
                  <p className="font-display text-xl text-gray-900 dark:text-gray-100">
                    {formatMinutes(data.time.estimatedTotal)}
                  </p>
                </div>
                <div>
                  <p className="caption-upper text-gray-500 dark:text-gray-400">Actually spent</p>
                  <p className="font-display text-xl text-gray-900 dark:text-gray-100">
                    {formatMinutes(data.time.spentOnEstimated)}
                  </p>
                </div>
              </div>
            )}

            {data.time.byCategory.length > 0 && (
              <>
                <div className="rule my-5" />
                <p className="caption-upper mb-3 text-gray-500 dark:text-gray-400">Where the time went</p>
                <ul className="space-y-2.5">
                  {data.time.byCategory.map(({ category, minutes }) => {
                    const top = data.time.byCategory[0].minutes || 1;
                    return (
                      <li key={category} className="flex items-center gap-3">
                        <span className="w-28 truncate text-xs capitalize text-gray-600 dark:text-gray-300">{category}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                          <div className="h-full rounded-full bg-clay/70" style={{ width: `${(minutes / top) * 100}%` }} />
                        </div>
                        <span className="w-16 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                          {formatMinutes(minutes)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {data.time.trackedCount === 0 && (
              <EmptyState
                size="sm"
                icon={<Target size={20} />}
                title="No tracked time yet"
                description="Start a timer on a task and this fills in with a real breakdown."
              />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
