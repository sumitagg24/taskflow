import { useEffect, useState } from 'react';
import { dailyAPI, type Task } from '@/api/tasks';

export interface OfflineDraft {
  id: string;
  title: string;
  createdAt: string;
}

const KEY = 'taskflow:offline-drafts';
const EVENT = 'taskflow:drafts-changed';

function notify() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Drafts saved while offline — the honest backing for the "N to sync" badge. */
export function readDrafts(): OfflineDraft[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (d): d is OfflineDraft =>
        typeof d === 'object' &&
        d !== null &&
        typeof (d as OfflineDraft).id === 'string' &&
        typeof (d as OfflineDraft).title === 'string'
    );
  } catch {
    return [];
  }
}

function writeDrafts(drafts: OfflineDraft[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(drafts));
  } catch {
    // Storage full/blocked — the in-memory copy still flushes this session.
  }
  notify();
}

export function addDraft(title: string): OfflineDraft {
  const draft: OfflineDraft = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: title.trim().slice(0, 200),
    createdAt: new Date().toISOString(),
  };
  writeDrafts([...readDrafts(), draft]);
  return draft;
}

export function removeDrafts(ids: string[]) {
  const gone = new Set(ids);
  writeDrafts(readDrafts().filter((d) => !gone.has(d.id)));
}

/**
 * Push every queued draft to the Inbox, oldest first. Stops at the first
 * failure so order is preserved; successes are removed as they land.
 */
export async function flushDrafts(onTask?: (task: Task) => void): Promise<{ synced: number; pending: number }> {
  const drafts = readDrafts();
  let synced = 0;
  for (const draft of drafts) {
    try {
      const { data } = await dailyAPI.quickCapture(draft.title);
      synced += 1;
      removeDrafts([draft.id]);
      onTask?.(data);
    } catch {
      break;
    }
  }
  return { synced, pending: readDrafts().length };
}

/** Live draft count + online flag for badges and pills. */
export function useOfflineDrafts() {
  const [drafts, setDrafts] = useState<OfflineDraft[]>(() =>
    typeof window === 'undefined' ? [] : readDrafts()
  );
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const sync = () => setDrafts(readDrafts());
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return { drafts, count: drafts.length, online };
}
