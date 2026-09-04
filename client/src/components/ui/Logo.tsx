import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/* ============================================================================
   TaskFlow brand mark — "flow lines"
   ----------------------------------------------------------------------------
   Three staggered strokes whose left edges step rightward, with a filled node
   terminating the middle one: a queue of work in motion, with one item in
   focus. Drawn on a 32-unit grid so the geometry is identical here and in
   `client/public/*.svg` (favicon / PWA icons) — edit both together.

   Geometry (32 grid, stroke-width 3, round caps):
     top     8 → 16.5  @ y10      visual x 6.5 → 18
     middle 10 → 19    @ y16      visual x 8.5 → 20.5
     node   cx 24 cy 16 r 2.25    visual x 21.75 → 26.25
     bottom 12 → 17    @ y22      visual x 10.5 → 18.5
   Content stays inside a 12.8-unit radius of centre, so the PWA icons are
   maskable-safe.

   The strokes are deliberately NOT drawn on with `pathLength`. Chrome suspends
   requestAnimationFrame in a tab that is backgrounded or occluded — even while
   `document.visibilityState` still reads "visible" — which freezes a JS-driven
   entrance on its first frame. A draw-on therefore leaves the splash screen
   showing an empty clay tile. Anything under `animate` here must start and end
   at a state where the mark is fully legible.
   ========================================================================== */

const STROKES = ['M8 10h8.5', 'M10 16h9', 'M12 22h5'] as const;

interface LogoMarkProps {
  size?: number;
  /** Add the entrance flourish (settle + one ping on the node). */
  animate?: boolean;
  className?: string;
}

/** The tile on its own — use wherever the wordmark would be redundant. */
export function LogoMark({ size = 32, animate = false, className }: LogoMarkProps) {
  const Group = animate ? motion.g : 'g';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="TaskFlow"
      className={cn('shrink-0', className)}
    >
      <rect width="32" height="32" rx="8.5" fill="var(--color-clay, #cc785c)" />

      {/* The artwork itself never animates — see the note above. `animate` only
          adds a settle, so the worst case is a mark 6% shy of full size. */}
      <Group
        {...(animate
          ? {
              initial: { scale: 0.94 },
              animate: { scale: 1 },
              transition: { type: 'spring' as const, stiffness: 260, damping: 20 },
              style: { transformBox: 'fill-box' as const, transformOrigin: 'center' },
            }
          : {})}
      >
        <g stroke="#faf9f5" strokeWidth="3" strokeLinecap="round">
          {STROKES.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <circle cx="24" cy="16" r="2.25" fill="#faf9f5" />
      </Group>

      {/* One ping on the active node. Starts and ends fully transparent, so a
          frozen tab simply never shows it. */}
      {animate && (
        <motion.circle
          cx="24"
          cy="16"
          r="2.25"
          fill="none"
          stroke="#faf9f5"
          strokeWidth="1.25"
          initial={{ scale: 1, opacity: 0 }}
          animate={{ scale: [1, 2.7], opacity: [0, 0.45, 0] }}
          transition={{ duration: 1.1, delay: 0.25, ease: [0.22, 1, 0.36, 1], times: [0, 0.35, 1] }}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        />
      )}
    </svg>
  );
}

interface LogoProps extends LogoMarkProps {
  /** Wordmark size in px; the tile scales with `size`. */
  wordmarkSize?: number;
  /** Small line under the wordmark (e.g. "Ana's workspace"). */
  subtitle?: string;
  wordmarkClassName?: string;
}

/** Tile + "TaskFlow" wordmark, locked to the editorial serif. */
export function Logo({
  size = 32,
  animate = false,
  wordmarkSize,
  subtitle,
  className,
  wordmarkClassName,
}: LogoProps) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <LogoMark size={size} animate={animate} />
      <span className="min-w-0">
        <span
          className={cn(
            'font-display block truncate leading-tight text-gray-900 dark:text-gray-50',
            wordmarkClassName
          )}
          style={{ fontSize: wordmarkSize ?? Math.round(size * 0.56) }}
        >
          TaskFlow
        </span>
        {subtitle && (
          <span className="block truncate text-[11px] leading-tight text-gray-500 dark:text-gray-500">
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}

export default Logo;
