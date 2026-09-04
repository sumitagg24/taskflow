import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Logo, LogoMark, ThemeToggle } from '@/components/ui';

/* ============================================================================
   Split editorial auth shell
   ----------------------------------------------------------------------------
   Left: the brand panel — cream canvas, paper grain, one line of copy that
   says what the product is for. Right: the form, and nothing else competing
   with it. Below `lg` the brand panel drops to a compact header so the form is
   the first thing a phone user sees.
   ========================================================================== */

const DEFAULT_POINTS = [
  'Kanban board and calendar in one place',
  'Focus timer that logs the hours for you',
  'An AI assistant that drafts the busywork',
] as const;

const reveal = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: 0.1 + i * 0.07, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

interface AuthShellProps {
  children: ReactNode;
  /** Serif line in the brand panel. */
  headline?: string;
  points?: readonly string[];
}

export default function AuthShell({
  children,
  headline = 'Plan the work, then work the plan.',
  points = DEFAULT_POINTS,
}: AuthShellProps) {
  return (
    <div className="canvas-grain relative min-h-screen bg-canvas lg:grid lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between border-r border-hairline px-12 py-12 lg:flex xl:px-16">
        <motion.div initial="hidden" animate="visible" variants={reveal} custom={0}>
          <Logo size={36} wordmarkSize={22} animate />
        </motion.div>

        <div className="max-w-md">
          <motion.h1
            initial="hidden"
            animate="visible"
            variants={reveal}
            custom={1}
            className="font-display text-[2.6rem] leading-[1.12] tracking-tight text-gray-900 dark:text-gray-50"
          >
            {headline}
          </motion.h1>

          <motion.hr
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="rule mt-8 mb-7 origin-left"
          />

          <ul className="space-y-3.5">
            {points.map((point, i) => (
              <motion.li
                key={point}
                initial="hidden"
                animate="visible"
                variants={reveal}
                custom={3 + i}
                className="flex items-start gap-3 text-[15px] leading-snug text-gray-600 dark:text-gray-400"
              >
                <span aria-hidden="true" className="mt-px text-clay select-none">
                  ▸
                </span>
                {point}
              </motion.li>
            ))}
          </ul>
        </div>

        <motion.p
          initial="hidden"
          animate="visible"
          variants={reveal}
          custom={7}
          className="text-xs text-gray-500 dark:text-gray-500"
        >
          Your workspace, your data. Nothing shared without you asking.
        </motion.p>
      </aside>

      <main className="relative flex min-h-screen flex-col justify-center px-5 py-10 sm:px-10 lg:min-h-0 lg:px-12 xl:px-16">
        <div className="absolute top-6 right-5 sm:right-8 lg:right-10">
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-[26rem]">
          <div className="mb-9 lg:hidden">
            <LogoMark size={40} animate />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
