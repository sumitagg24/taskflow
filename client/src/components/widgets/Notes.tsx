import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StickyNote, Plus, Trash2, Pin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Note {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: number;
}

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('quickNotes') || '[]');
    } catch { return []; }
  });
  const [newNote, setNewNote] = useState('');

  const saveNotes = (updated: Note[]) => {
    setNotes(updated);
    localStorage.setItem('quickNotes', JSON.stringify(updated));
  };

  const addNote = () => {
    if (!newNote.trim()) return;
    const note: Note = {
      id: Date.now().toString(),
      text: newNote.trim(),
      pinned: false,
      createdAt: Date.now(),
    };
    saveNotes([note, ...notes]);
    setNewNote('');
  };

  const deleteNote = (id: string) => {
    saveNotes(notes.filter(n => n.id !== id));
  };

  const togglePin = (id: string) => {
    saveNotes(notes.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n));
  };

  const updateNote = (id: string, text: string) => {
    saveNotes(notes.map(n => n.id === id ? { ...n, text } : n));
  };

  const sorted = [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.createdAt - a.createdAt;
  });

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <StickyNote size={18} className="text-yellow-500" />
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Notes</h3>
      </div>

      {/* Add Note */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addNote()}
          placeholder="Write a quick note..."
          className="input-field flex-1"
        />
        <button onClick={addNote} className="btn-primary px-3">
          <Plus size={16} />
        </button>
      </div>

      {/* Notes List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        <AnimatePresence>
          {sorted.map((note) => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                'rounded-xl p-3 group relative',
                note.pinned
                  ? 'bg-yellow-50 dark:bg-yellow-500/5 border border-yellow-200 dark:border-yellow-500/20'
                  : 'bg-gray-50 dark:bg-gray-800/50'
              )}
            >
              <textarea
                value={note.text}
                onChange={(e) => updateNote(note.id, e.target.value)}
                className="w-full bg-transparent text-sm text-gray-700 dark:text-gray-300 resize-none outline-none"
                rows={2}
              />
              <div className="flex items-center justify-end gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => togglePin(note.id)}
                  className={cn('rounded p-1 transition-colors', note.pinned ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500')}
                >
                  <Pin size={12} />
                </button>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="rounded p-1 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {notes.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-4">No notes yet</p>
        )}
      </div>
    </div>
  );
}
