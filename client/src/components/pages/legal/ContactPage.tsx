import { useState } from 'react';
import { LegalLayout } from './LegalLayout';
import { Input, Textarea, Button } from '@/components/ui';
import { contactAPI } from '@/api/tasks';

/* ============================================================================
   /contact — public Contact Support page.

   The support inbox address lives ONLY in the server environment
   (SUPPORT_EMAIL) and is never shipped to the browser: this form POSTs to
   POST /api/contact, which validates, rate-limits, and emails server-side.
   ========================================================================== */

type Status = 'idle' | 'sending' | 'sent';

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status !== 'idle') return;
    setError(null);
    // Client-side guard mirrors the server caps (the server is authoritative).
    if (name.trim().length < 2) return setError('Please tell us your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setError('Please enter a valid email address.');
    }
    if (subject.trim().length < 4) return setError('Please add a short subject.');
    if (message.trim().length < 10) {
      return setError('Please describe your issue in a little more detail (10+ characters).');
    }
    setStatus('sending');
    try {
      await contactAPI.submit({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
      });
      setStatus('sent');
    } catch (err: unknown) {
      const serverMessage = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setError(serverMessage || 'Could not send your message. Please try again.');
      setStatus('idle');
    }
  };

  return (
    <LegalLayout
      title="Contact Support"
      intro="Have a question or found an issue? Send us a message and our team will get back to you."
    >
      {status === 'sent' ? (
        <div
          role="status"
          className="rounded-xl border border-green-200 bg-green-50/80 px-5 py-6 text-center dark:border-green-500/25 dark:bg-green-500/10"
        >
          <p className="font-display text-xl tracking-tight text-gray-900 dark:text-gray-100">
            Message sent
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-gray-600 dark:text-gray-400">
            Thanks — your message is on its way. Our team will get back to you at the
            email address you provided.
          </p>
          <a
            href="/"
            className="mt-4 inline-block rounded-lg text-sm font-medium text-yellow-700 underline decoration-yellow-500/40 underline-offset-4 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300"
          >
            ← Back to TaskFlow
          </a>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50/80 px-3.5 py-3 text-[13px] leading-snug text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              placeholder="Ada Lovelace"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              maxLength={100}
            />
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={254}
              helperText="Use your account email for account requests."
            />
          </div>
          <Input
            label="Subject"
            placeholder="What is this about?"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            maxLength={120}
          />
          <Textarea
            label="Message"
            placeholder="Tell us what happened, and what you expected…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            rows={6}
            maxLength={2000}
          />
          <div className="pt-1">
            <Button type="submit" variant="primary" loading={status === 'sending'} disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Send message'}
            </Button>
          </div>
        </form>
      )}
    </LegalLayout>
  );
}
