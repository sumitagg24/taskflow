import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Play, Pause, Square, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeTrackingAPI } from '@/api/tasks';
import { toast } from 'sonner';

interface TimeTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  // The backend creates one session per task per user; both props are required
  // when isOpen is true.
  taskId: string;
  taskTitle?: string;
  theme?: 'dark' | 'light';
}

interface TimeSession {
  _id: string;
  start: string;
  end?: string | null;
  duration?: number;
  notes?: string;
  isPaused?: boolean;
  pausedAt?: string | null;
}

export function TimeTrackingModal({ isOpen, onClose, taskId, taskTitle, theme = 'dark' }: TimeTrackingModalProps) {
  const [session, setSession] = useState<TimeSession | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const startedAtRef = useRef<number | null>(null);

  // When the modal opens, ask the backend if there's already an active
  // session for this task so we can resume the existing one instead of
  // creating a duplicate.
  useEffect(() => {
    if (!isOpen || !taskId) return;
    setLoading(true);
    timeTrackingAPI
      .active(taskId)
      .then(({ data }) => {
        if (data?.active && data.session) {
          setSession(data.session);
          setIsPaused(!!data.session.isPaused);
          startedAtRef.current = new Date(data.session.start).getTime();
        } else {
          setSession(null);
          setIsPaused(false);
          startedAtRef.current = null;
        }
      })
      .catch(() => {
        // Silent — modal can still be used.
      })
      .finally(() => setLoading(false));
  }, [isOpen, taskId]);

  // Tick the local elapsed-time counter once a second while a session is
  // active. The server is the source of truth for the persisted duration.
  useEffect(() => {
    if (!session || isPaused) return;
    const tick = () => {
      if (startedAtRef.current) {
        setElapsedSeconds(Math.round((Date.now() - startedAtRef.current) / 1000));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session, isPaused]);

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const start = async () => {
    if (!taskId || busy) return;
    setBusy(true);
    try {
      const { data } = await timeTrackingAPI.start(taskId, notes || undefined);
      setSession(data.session);
      setIsPaused(false);
      startedAtRef.current = new Date(data.session.start).getTime();
      setElapsedSeconds(0);
      toast.success('Timer started');
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Could not start timer';
      // "Timer is already running" is informational, not an error.
      if (msg.toLowerCase().includes('already running')) {
        try {
          const active = await timeTrackingAPI.active(taskId);
          if (active.data?.active) {
            setSession(active.data.session);
            setIsPaused(!!active.data.session.isPaused);
            startedAtRef.current = new Date(active.data.session.start).getTime();
            setElapsedSeconds(Math.round((Date.now() - new Date(active.data.session.start).getTime()) / 1000));
          }
        } catch { /* ignore */ }
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const pause = async () => {
    if (!taskId || busy) return;
    setBusy(true);
    try {
      const { data } = await timeTrackingAPI.pause(taskId);
      setSession(data.session);
      setIsPaused(true);
      if (data.session?.start) {
        // Sync the displayed elapsed time with the server's accumulated value
        // so the tick interval doesn't show stale seconds after resuming.
        const serverElapsed = Math.round((Date.now() - new Date(data.session.start).getTime()) / 1000);
        setElapsedSeconds(serverElapsed);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not pause timer');
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    if (!taskId || busy) return;
    setBusy(true);
    try {
      const { data } = await timeTrackingAPI.resume(taskId);
      setSession(data.session);
      setIsPaused(false);
      if (data.session?.start) {
        startedAtRef.current = new Date(data.session.start).getTime();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not resume timer');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!taskId || busy) return;
    setBusy(true);
    try {
      const { data } = await timeTrackingAPI.stop(taskId);
      const minutes = data.duration ?? 0;
      setSession(null);
      setIsPaused(false);
      setElapsedSeconds(0);
      startedAtRef.current = null;
      toast.success(`Session saved — ${minutes} min`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not stop timer');
    } finally {
      setBusy(false);
    }
  };

  const addManual = (minutes: number) => {
    // Adjust the local elapsed view only — useful for catching up after a
    // break. Persistence happens on stop/pause via the real timestamps.
    if (!session) return;
    startedAtRef.current = (startedAtRef.current || Date.now()) - minutes * 60_000;
    setElapsedSeconds(prev => prev + minutes * 60);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={cn(
          'relative w-full max-w-md rounded-2xl border shadow-2xl',
          theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800/50 p-4">
          <div>
            <h2 className="text-lg font-semibold">Time Tracking</h2>
            <p className="text-sm text-gray-500 truncate max-w-[280px]">{taskTitle || 'No task selected'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-800/50 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Timer */}
        <div className="p-6 text-center">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={28} className="animate-spin text-yellow-500" />
              <p className="text-sm text-gray-500">Looking for an active timer…</p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <div className="text-6xl font-mono font-bold tracking-tight">
                  {formatTime(elapsedSeconds)}
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  {!session
                    ? 'No active timer'
                    : isPaused
                      ? 'Paused'
                      : 'Timer is running'}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-3 mb-6">
                {!session && (
                  <button
                    type="button"
                    onClick={start}
                    disabled={busy}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-yellow-400 text-gray-900 hover:bg-yellow-500 transition-colors disabled:opacity-50"
                  >
                    <Play size={24} fill="currentColor" />
                    Start
                  </button>
                )}
                {session && !isPaused && (
                  <button
                    type="button"
                    onClick={pause}
                    disabled={busy}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
                  >
                    <Pause size={24} fill="currentColor" />
                    Pause
                  </button>
                )}
                {session && isPaused && (
                  <button
                    type="button"
                    onClick={resume}
                    disabled={busy}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-yellow-400 text-gray-900 hover:bg-yellow-500 transition-colors disabled:opacity-50"
                  >
                    <Play size={24} fill="currentColor" />
                    Resume
                  </button>
                )}
                <button
                  type="button"
                  onClick={stop}
                  disabled={busy || !session}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Square size={24} fill="currentColor" />
                  Stop
                </button>
              </div>

              {/* Quick Add Time */}
              {session && (
                <div className="flex items-center justify-center gap-2 mb-6">
                  <span className="text-sm text-gray-500">Adjust:</span>
                  {[5, 15, 30, 60].map(min => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => addManual(min)}
                      className="px-3 py-1 rounded-lg bg-gray-800 text-sm hover:bg-gray-700 transition-colors"
                    >
                      +{min}m
                    </button>
                  ))}
                </div>
              )}

              {/* Notes (only relevant when starting) */}
              {!session && (
                <div className="mb-2 text-left">
                  <label className="block text-sm font-medium mb-2">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="What are you working on?"
                    className={cn(
                      'w-full bg-gray-50 dark:bg-gray-800/50 border rounded-xl px-3 py-2 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500',
                      theme === 'dark' ? 'border-gray-700 text-gray-100' : 'border-gray-200 text-gray-900'
                    )}
                    rows={2}
                  />
                </div>
              )}

              {session && (
                <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-green-500">
                  <CheckCircle2 size={14} />
                  Session saved when you stop
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-gray-800/50 p-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl hover:bg-gray-800/50 transition-colors text-sm"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
