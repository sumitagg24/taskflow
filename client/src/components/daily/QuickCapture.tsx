import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, Inbox, Keyboard } from 'lucide-react';
import { toast } from 'sonner';
import { dailyAPI, type Task } from '@/api/tasks';
import { addDraft } from '@/lib/offlineDrafts';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

/**
 * Global quick capture — mounted once in the app shell so it works from every
 * main screen. Title-only create into the Inbox; triage happens later.
 * Desktop shortcut: press Q anywhere outside a text field.
 */
export default function QuickCapture({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (task: Task) => void;
}) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setError(null);
      setBusy(false);
    }
  }, [open ]);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const submit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const value = title.trim();
      if (!value || busy) return;
      if (!navigator.onLine) {
        // Offline is a queue, not an error: the draft syncs on reconnect.
        addDraft(value);
        toast.success('Saved offline — lands in your Inbox on reconnect.');
        setTitle('');
        onClose();
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const { data } = await dailyAPI.quickCapture(value);
        toast.success('Captured to Inbox', {
          description: 'Triage it when you are ready — nothing else changed.',
        });
        onCreated?.(data);
        setTitle('');
        onClose();
      } catch (err: unknown) {
        const msg =
          (err as { response?: { status?: number; data?: { message?: string } } })?.response?.status === 409
            ? 'That just changed elsewhere — refresh Inbox and try again.'
            : (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
              'Could not capture — try again.';
        setError(msg);
      } finally {
        setBusy(false);
      }
    },
    [title, busy, onClose, onCreated]
  );

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Quick capture"
      subtitle="Title only — it lands in your Inbox for triage later."
      size="sm"
    >
      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="quick-capture-input" className="block text-[13px] font-medium text-gray-700 dark:text-gray-300">
          <span className="flex items-center gap-1.5">
            <Inbox size={13} aria-hidden="true" />
            Inbox task
          </span>
        </label>
        <input
          id="quick-capture-input"
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 200))}
          placeholder="What just came up?"
          maxLength={200}
          autoFocus
          autoComplete="off"
          aria-describedby="quick-capture-help"
          className="bg-card min-h-[44px] w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-base text-gray-900 outline-none transition-[border-color,box-shadow] placeholder:text-gray-400 focus:border-yellow-400 focus:ring-[3px] focus:ring-yellow-400/15 dark:border-gray-700 dark:text-gray-100"
        />
        <p id="quick-capture-help" className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Keyboard size={12} aria-hidden="true" />
          Press Q anywhere to open this · Enter to save · Esc to close
        </p>
        {offline && (
          <p role="status" className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-500/10 dark:text-yellow-300">
            Offline — saving here queues it for your Inbox on reconnect.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!title.trim()} icon={<Plus size={15} aria-hidden="true" />}>
            Capture
          </Button>
        </div>
      </form>
    </Modal>
  );
}


