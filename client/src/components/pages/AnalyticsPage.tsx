import { Navigate } from 'react-router-dom';

/**
 * The Analytics page was merged into Insights: its genuinely distinct
 * content (priority/category distribution + stats timeframe switching) now
 * lives in `InsightsPage` as the "Work mix" section, and everything else
 * (key metrics, completion rate, status overview, quick stats) already
 * existed there as score/throughput/backlog/streak.
 *
 * This file stays so the `/analytics` route (owned by routes.tsx, untouched)
 * and any existing bookmarks keep working — they land on /insights instead
 * of a second, half-maintained dashboard.
 */
export default function AnalyticsPage() {
  return <Navigate to="/insights" replace />;
}
