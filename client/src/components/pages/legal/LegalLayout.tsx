import type { ReactNode } from 'react';
import { Logo } from '@/components/ui';

export const SUPPORT_EMAIL = 'sumitaggw2004@gmail.com';
export const LAST_UPDATED = 'September 13, 2026';

/** Shared chrome for the public legal pages (/privacy, /terms). */
export function LegalLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#faf9f5] text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="border-b border-gray-200/80 dark:border-gray-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <a href="/" aria-label="Back to TaskFlow" className="rounded-lg focus-visible:outline-2 focus-visible:outline-yellow-500">
            <Logo size={30} />
          </a>
          <a
            href="/"
            className="rounded-lg text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-yellow-500 dark:text-gray-400 dark:hover:text-gray-100"
          >
            ← Back to TaskFlow
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 md:py-14">
        <h1 className="font-display text-3xl tracking-tight md:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Last updated: {LAST_UPDATED}
        </p>
        <p className="mt-5 leading-relaxed text-gray-700 dark:text-gray-300">{intro}</p>
        <div className="mt-8 space-y-8">{children}</div>
      </main>

      <footer className="border-t border-gray-200/80 dark:border-gray-800">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-5 py-6 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between dark:text-gray-400">
          <span>© 2026 TaskFlow</span>
          <span className="flex flex-wrap gap-x-5 gap-y-1">
            <a href="/privacy" className="underline-offset-4 hover:underline">
              Privacy Policy
            </a>
            <a href="/terms" className="underline-offset-4 hover:underline">
              Terms of Service
            </a>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline-offset-4 hover:underline">
              Contact us
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

/** One numbered section inside a legal document. */
export function LegalSection({
  index,
  heading,
  children,
}: {
  index: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={`${index}. ${heading}`}>
      <h2 className="font-display text-xl tracking-tight">
        <span className="mr-2 text-gray-400 dark:text-gray-500">{index}.</span>
        {heading}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-gray-700 dark:text-gray-300">
        {children}
      </div>
    </section>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-6">{children}</ul>;
}
