import { useState, useCallback, useRef, useMemo, useEffect, memo, DragEvent, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MoreHorizontal, GripVertical, Trash2, Flame, MessageSquare, CheckSquare, Clock, Paperclip, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { reportCreateError } from '@/lib/planLimit';
import { PriorityBadge } from './ui/Badge';
import { Button } from './ui/Button';
import { DeleteConfirmModal } from './ui/DeleteConfirmModal';
import { updateTask, deleteTask, createTask, batchUpdate, restoreTask, updateOrder } from '@/api/tasks';
import { BulkActionsBar } from './BulkActionsBar';
import { TimeTrackingModal } from './TimeTrackingModal';
import { toast } from 'sonner';

type ColumnType = 'backlog' | 'pending' | 'in-progress' | 'completed';

interface CardType {
  _id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  dueDate?: string;
  tags?: string[];
  subtasks?: any[];
  comments?: any[];
  attachments?: any[];
  category?: string;
  isFavorite?: boolean;
  [key: string]: any;
}

const columns: { id: ColumnType; title: string; color: string }[] = [
  { id: 'backlog', title: 'Backlog', color: 'text-gray-500 dark:text-gray-400' },
  { id: 'pending', title: 'To Do', color: 'text-blue-600 dark:text-blue-300' },
  { id: 'in-progress', title: 'In Progress', color: 'text-orange-600 dark:text-orange-300' },
  { id: 'completed', title: 'Completed', color: 'text-green-600 dark:text-green-300' },
];

// Column beds are a flat warm tint, not a shadowed panel — the cards carry the
// only borders on the board.
const columnBgColors: Record<string, string> = {
  backlog: 'bg-gray-100/70 dark:bg-gray-800/30',
  pending: 'bg-blue-50/60 dark:bg-blue-500/6',
  'in-progress': 'bg-orange-50/60 dark:bg-orange-500/6',
  completed: 'bg-green-50/60 dark:bg-green-500/6',
};

// Priority rail on the card's left edge, in the app's clay-family palette
// rather than the stock Tailwind reds/yellows.
const PRIORITY_RAIL: Record<string, string> = {
  critical: '#c64545',
  high: '#d89f55',
  medium: '#cc785c',
  low: '#b0aea5',
  none: 'var(--border-color)',
};

interface KanbanBoardProps {
  tasks: CardType[];
  onRefresh: () => void;
  onDelete?: (task: any) => void;
}

export default function KanbanBoard({ tasks, onRefresh, onDelete }: KanbanBoardProps) {
  const [cards, setCards] = useState<CardType[]>(tasks);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [timeTrackTask, setTimeTrackTask] = useState<CardType | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Trailing-edge coalescing for drop-order persistence: rapid successive
  // drops cancel the pending save and only the latest column order is sent.
  // This is request coalescing, not a UI delay — the drop itself is instant.
  const orderPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flush any pending order save on unmount so no setState/toast fires late.
  useEffect(() => () => {
    if (orderPersistTimer.current) clearTimeout(orderPersistTimer.current);
  }, []);

  // Keep cards in sync with parent task list — useEffect prevents the
  // double-render caused by calling setState during render.
  useEffect(() => {
    setCards(tasks);
    setSelected(prev => {
      const visible = new Set(tasks.map(t => t._id));
      const next = new Set<string>();
      for (const id of prev) if (visible.has(id)) next.add(id);
      return next;
    });
  }, [tasks]);

  const scheduleOrderPersist = useCallback((orders: { _id: string; order: number; status: string }[]) => {
    if (orderPersistTimer.current) clearTimeout(orderPersistTimer.current);
    const snapshot = orders;
    orderPersistTimer.current = setTimeout(() => {
      orderPersistTimer.current = null;
      // Silent on success (order is cosmetic); local state is already
      // correct so no rollback is needed on failure — just surface a toast.
      updateOrder(snapshot).catch(() => {
        toast.error('Could not save card order');
      });
    }, 600);
  }, []);

  const updateCardStatus = useCallback(async (cardId: string, newStatus: string) => {
    // Snapshot the moved card so a failed persist can restore it locally
    // without a full GET /tasks refetch.
    const prev = cards.find(c => c._id === cardId);
    const prevStatus = prev?.status;
    const prevOrder = prev?.order;
    // Optimistic UI update
    setCards(prevCards => prevCards.map(c => c._id === cardId ? { ...c, status: newStatus } : c));
    try {
      await updateTask(cardId, { status: newStatus });
      // Stable id collapses rapid-move bursts into a single toast.
      toast.success(`Task moved to ${columns.find(c => c.id === newStatus)?.title}`, { id: 'kanban-move' });
      // Persist the destination column's visible order in the background.
      // Fire-and-forget: never blocks the drop animation.
      const nextColumnOrder = cards
        .map(c => (c._id === cardId ? { ...c, status: newStatus } : c))
        .filter(c => c.status === newStatus)
        .map((c, order) => ({ _id: c._id, order, status: newStatus }));
      scheduleOrderPersist(nextColumnOrder);
    } catch {
      if (prevStatus !== undefined) {
        setCards(prevCards => prevCards.map(c => c._id === cardId
          ? { ...c, status: prevStatus, ...(prevOrder !== undefined ? { order: prevOrder } : {}) }
          : c));
      }
      toast.error('Failed to update task');
    }
  }, [cards, scheduleOrderPersist]);

  const dropFromSelection = useCallback((cardId: string) => {
    setSelected(prev => {
      if (!prev.has(cardId)) return prev;
      const next = new Set(prev);
      next.delete(cardId);
      return next;
    });
  }, []);

  // Deleting is a soft delete on the server, so the honest affordance is an
  // instant Undo rather than a confirmation the user has to read.
  const trashCard = useCallback(async (cardId: string) => {
    const card = cards.find(c => c._id === cardId);
    try {
      await deleteTask(cardId);
      setCards(pv => pv.filter(c => c._id !== cardId));
      dropFromSelection(cardId);
      toast.success(card ? `“${card.title}” moved to Trash` : 'Moved to Trash', {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              const { data } = await restoreTask(cardId);
              setCards(pv => (pv.some(c => c._id === data._id) ? pv : [...pv, data]));
              toast.success('Restored');
            } catch {
              toast.error('Could not restore — it is still in Trash');
            }
          },
        },
      });
    } catch {
      toast.error('Failed to delete task');
    }
  }, [cards, dropFromSelection]);

  const handleDeleteCard = useCallback(async (cardId: string) => {
    const card = cards.find(c => c._id === cardId);
    // The shell owns the confirm-and-undo flow when it passed a handler down;
    // otherwise (BurnBarrel) trash it here.
    if (onDelete && card) onDelete(card);
    else await trashCard(cardId);
  }, [cards, onDelete, trashCard]);

  const handleAddCard = useCallback(async (title: string, column: ColumnType) => {
    const tempId = `temp-${Math.random()}`;
    const tempCard: CardType = { _id: tempId, title, status: column };
    setCards(pv => [...pv, tempCard]);

    try {
      const { data } = await createTask({ title, status: column });
      setCards(pv => pv.map(c => c._id === tempId ? { ...data, status: column } : c));
      toast.success('Task created');
    } catch (err) {
      setCards(pv => pv.filter(c => c._id !== tempId));
      reportCreateError(err);
    }
  }, []);

  // Multi-select handlers wired into BulkActionsBar.
  const toggleSelect = useCallback((cardId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const handleStartTimer = useCallback((card: CardType) => setTimeTrackTask(card), []);

  const handleBulkStatus = useCallback(async (status: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      await batchUpdate(ids, { status });
      setCards(prev => prev.map(c => selected.has(c._id) ? { ...c, status } : c));
      toast.success(`${ids.length} task${ids.length === 1 ? '' : 's'} updated`, { id: 'kanban-move' });
      clearSelection();
    } catch {
      toast.error('Bulk update failed');
    }
  }, [selected, clearSelection]);

  const handleBulkPriority = useCallback(async (priority: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      await batchUpdate(ids, { priority });
      setCards(prev => prev.map(c => selected.has(c._id) ? { ...c, priority } : c));
      toast.success(`${ids.length} task${ids.length === 1 ? '' : 's'} updated`);
      clearSelection();
    } catch {
      toast.error('Bulk update failed');
    }
  }, [selected, clearSelection]);

  // Bulk delete is the one place a dialog earns its keep: it is many rows at
  // once, so the count gets confirmed before anything moves.
  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    // Local snapshot: the list only changes after the deletes succeed, so a
    // failure restores this instead of refetching GET /tasks.
    const snapshot = cards;
    setBulkDeleting(true);
    try {
      await Promise.all(ids.map(id => deleteTask(id)));
      setCards(prev => prev.filter(c => !selected.has(c._id)));
      setBulkDeleteOpen(false);
      toast.success(`${ids.length} task${ids.length === 1 ? '' : 's'} moved to Trash`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            const results = await Promise.allSettled(ids.map(id => restoreTask(id)));
            const restored = results
              .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
              .map(r => r.value.data);
            setCards(prev => {
              const seen = new Set(prev.map(c => c._id));
              return [...prev, ...restored.filter(t => !seen.has(t._id))];
            });
            if (restored.length === ids.length) toast.success('Restored');
            else toast.error(`Restored ${restored.length} of ${ids.length} — the rest are in Trash`);
          },
        },
      });
      clearSelection();
    } catch {
      setCards(snapshot);
      toast.error('Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  }, [selected, clearSelection, cards]);

  // Collect unique existing tags from selected cards for tag-picker suggestions
  const selectedTags = useMemo(() => {
    const allTags = cards
      .filter(c => selected.has(c._id))
      .flatMap(c => c.tags ?? []);
    return [...new Set(allTags)].sort();
  }, [cards, selected]);

  const handleBulkTag = useCallback(async (tag: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0 || !tag.trim()) return;
    try {
      await batchUpdate(ids, { tags: [tag.trim()] });
      setCards(prev => prev.map(c => selected.has(c._id) ? { ...c, tags: [tag.trim()] } : c));
      toast.success(`Tagged ${ids.length} task${ids.length === 1 ? '' : 's'} with "${tag.trim()}"`);
      clearSelection();
    } catch {
      toast.error('Bulk tag failed');
    }
  }, [selected, clearSelection]);

  return (
    <>
      <div className="flex h-full gap-4 overflow-x-auto pb-4">
        {columns.map(col => {
          const columnCards = cards.filter(c => c.status === col.id);
          return (
            <MemoColumn
              key={col.id}
              title={col.title}
              column={col.id}
              headingColor={col.color}
              bgColor={columnBgColors[col.id]}
              cards={columnCards}
              onUpdateStatus={updateCardStatus}
              onDelete={handleDeleteCard}
              onAddCard={handleAddCard}
              selected={selected}
              onToggleSelect={toggleSelect}
              onStartTimer={handleStartTimer}
            />
          );
        })}
        <BurnBarrel onDelete={trashCard} />
      </div>

      <AnimatePresence>
        {selected.size > 0 && (
          <BulkActionsBar
            selectedCount={selected.size}
            totalTasks={cards.length}
            onSelectStatus={handleBulkStatus}
            onSelectPriority={handleBulkPriority}
            onDelete={() => setBulkDeleteOpen(true)}
            onSelectTags={handleBulkTag}
            existingTags={selectedTags}
            onClose={clearSelection}
          />
        )}
      </AnimatePresence>

      <DeleteConfirmModal
        isOpen={bulkDeleteOpen}
        onClose={() => { if (!bulkDeleting) setBulkDeleteOpen(false); }}
        onConfirm={handleBulkDelete}
        title={`Move ${selected.size} task${selected.size === 1 ? '' : 's'} to Trash`}
        message="They stay restorable for 30 days, and you can undo this right after."
        confirmLabel="Move to Trash"
        loading={bulkDeleting}
      />

      {timeTrackTask && (
        <TimeTrackingModal
          isOpen={!!timeTrackTask}
          onClose={() => setTimeTrackTask(null)}
          taskId={timeTrackTask._id}
          taskTitle={timeTrackTask.title}
        />
      )}
    </>
  );
}

interface ColumnProps {
  title: string;
  headingColor: string;
  bgColor: string;
  cards: CardType[];
  column: ColumnType;
  onUpdateStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onAddCard: (title: string, col: ColumnType) => void;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onStartTimer: (task: CardType) => void;
}

function Column({ title, headingColor, bgColor, cards, column, onUpdateStatus, onDelete, onAddCard, selected, onToggleSelect, onStartTimer }: ColumnProps) {
  const [active, setActive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [visibleCount, setVisibleCount] = useState(100);
  useEffect(() => setVisibleCount(100), [cards.length]);
  const moveNeighbor = useCallback((cardId: string, direction: -1 | 1) => {
    const order = columns.map((c) => c.id);
    const card = cards.find((c) => c._id === cardId);
    if (!card) return;
    const next = order[order.indexOf(card.status as ColumnType) + direction];
    if (next) onUpdateStatus(cardId, next);
  }, [cards, onUpdateStatus]);
  // Ref-based backup store for drag data — avoids relying solely on dataTransfer
  const dragDataRef = useRef<{ cardId: string; fromColumn: string } | null>(null);

  const handleDragStart = (e: DragEvent, card: CardType) => {
    // Primary: dataTransfer
    e.dataTransfer.setData('cardId', card._id);
    e.dataTransfer.setData('fromColumn', column);
    e.dataTransfer.effectAllowed = 'move';
    // Backup: ref (some browsers clear dataTransfer on drop)
    dragDataRef.current = { cardId: card._id, fromColumn: column };
  };

  const handleDragEnd = async (e: DragEvent) => {
    // Try dataTransfer first, fall back to ref
    let cardId = e.dataTransfer.getData('cardId');
    let fromColumn = e.dataTransfer.getData('fromColumn') as ColumnType;

    if (!cardId && dragDataRef.current) {
      cardId = dragDataRef.current.cardId;
      fromColumn = dragDataRef.current.fromColumn as ColumnType;
    }

    setActive(false);
    clearHighlights();
    dragDataRef.current = null;

    if (!cardId || fromColumn === column) return;

    await onUpdateStatus(cardId, column);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    highlightIndicator(e);
    setActive(true);
  };

  const handleDragLeave = () => {
    clearHighlights();
    setActive(false);
  };

  const clearHighlights = (els?: HTMLElement[]) => {
    const indicators = els || getIndicators();
    indicators.forEach(i => i.style.opacity = '0');
  };

  const highlightIndicator = (e: DragEvent) => {
    const indicators = getIndicators();
    clearHighlights(indicators);
    const el = getNearestIndicator(e, indicators);
    el.element.style.opacity = '1';
  };

  const getNearestIndicator = (e: DragEvent, indicators: HTMLElement[]) => {
    const DISTANCE_OFFSET = 50;
    return indicators.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = e.clientY - (box.top + DISTANCE_OFFSET);
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY, element: indicators[indicators.length - 1] });
  };

  const getIndicators = () => {
    return Array.from(document.querySelectorAll(`[data-column="${column}"]`) as unknown as HTMLElement[]);
  };

  const handleAddSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAddCard(text.trim(), column);
    setText('');
    setAdding(false);
  };

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h3 className={cn('caption-upper', headingColor)}>{title}</h3>
          <span className="bg-surface-strong flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[10px] font-medium tabular-nums text-gray-600 dark:text-gray-300">
            {cards.length}
          </span>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="hover:bg-card-hover rounded-lg p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          aria-label={`Add a task to ${title}`}
          title={`Add a task to ${title}`}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>

      <div
        onDrop={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'flex min-h-[200px] flex-col gap-2 rounded-2xl p-3 transition-colors',
          active ? 'bg-yellow-50 ring-2 ring-yellow-400/35 dark:bg-yellow-500/10' : bgColor
        )}
      >
        <AnimatePresence>
          {cards.length === 0 && !adding && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">Drop tasks here</p>
            </motion.div>
          )}
          {cards.slice(0, visibleCount).map(c => (
            <MemoCard
              key={c._id}
              card={c}
              onDragStart={handleDragStart}
              onDelete={onDelete}
              isSelected={selected.has(c._id)}
              onToggleSelect={onToggleSelect}
              onStartTimer={onStartTimer}
              onMoveCard={moveNeighbor}
            />
          ))}
        </AnimatePresence>
        {cards.length > visibleCount && (
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + 100)}
            className="mt-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-200/60 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            Show more ({cards.length - visibleCount} remaining)
          </button>
        )}
        <DropIndicator beforeId={null} column={column} />

        {/* Add Card Form */}
        {adding ? (
          <motion.form
            layout
            onSubmit={handleAddSubmit}
            className="bg-card rounded-xl border border-yellow-400/40 p-3 ring-1 ring-yellow-400/10"
          >
            <label className="sr-only" htmlFor={`add-card-${column}`}>
              New task in {title}
            </label>
            <textarea
              id={`add-card-${column}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              placeholder="What needs doing?"
              className="w-full resize-none bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddSubmit(e);
                }
                if (e.key === 'Escape') {
                  setAdding(false);
                  setText('');
                }
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-1.5">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">Enter to add</span>
              <div className="flex items-center gap-1.5">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setAdding(false); setText(''); }}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!text.trim()}>
                  Add
                </Button>
              </div>
            </div>
          </motion.form>
        ) : null}
      </div>
    </div>
  );
}

interface CardProps {
  card: CardType;
  onDragStart: (e: DragEvent, card: CardType) => void;
  onDelete: (id: string) => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onStartTimer: (task: CardType) => void;
  onMoveCard: (id: string, direction: -1 | 1) => void;
}

function Card({ card, onDragStart, onDelete, isSelected, onToggleSelect, onStartTimer, onMoveCard }: CardProps) {
  const subtaskProgress = card.subtasks?.length
    ? Math.round((card.subtasks.filter((s: any) => s.completed).length / card.subtasks.length) * 100)
    : -1;

  const isOverdue = card.dueDate && new Date(card.dueDate) < new Date() && card.status !== 'completed';

  return (
    <>
      <DropIndicator beforeId={card._id} column={card.status} />
      <motion.div
        layout
        layoutId={card._id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={cn(
          'group bg-card cursor-grab rounded-xl border p-3.5 transition-colors active:cursor-grabbing',
          isOverdue ? 'border-red-300/70 dark:border-red-500/30' : 'border-hairline hover:border-gray-300 dark:hover:border-gray-600',
          isSelected && 'ring-2 ring-yellow-400'
        )}
        style={{
          borderLeftWidth: '3px',
          borderLeftColor: PRIORITY_RAIL[card.priority ?? 'none'] ?? PRIORITY_RAIL.none,
        }}
      >
        <div
          draggable="true"
          tabIndex={0}
          role="button"
          aria-label={`${card.title} — press left or right arrow to move between columns`}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); onMoveCard(card._id, 1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); onMoveCard(card._id, -1); }
          }}
          onDragStart={(e: DragEvent<HTMLDivElement>) => onDragStart(e, card)}
          className="space-y-2"
        >
          {/* Header with select + drag handle + actions */}
          <div className="flex items-start gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelect(card._id); }}
              onMouseDown={(e) => e.stopPropagation()}
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                isSelected
                  ? 'border-yellow-400 bg-yellow-400 text-gray-900'
                  : 'border-gray-300 hover:border-yellow-400 dark:border-gray-600'
              )}
              aria-pressed={isSelected}
              aria-label={isSelected ? `Deselect “${card.title}”` : `Select “${card.title}” for bulk actions`}
              title={isSelected ? 'Deselect' : 'Select for bulk action'}
            >
              {isSelected && <CheckSquare size={12} aria-hidden="true" />}
            </button>
            <GripVertical
              size={14}
              className="mt-0.5 shrink-0 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-600"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">{card.title}</p>
            </div>
            <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button
                onClick={(e) => { e.stopPropagation(); onStartTimer(card); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="hover:bg-surface-strong rounded p-1 text-gray-500 transition-colors hover:text-yellow-600 dark:text-gray-400"
                aria-label={`Track time on “${card.title}”`}
                title="Start time tracking"
              >
                <Timer size={14} aria-hidden="true" />
              </button>
              {/* Opens the detail drawer. Dispatched rather than threaded as a
                  prop: `open-task` is already the app's channel for this (the
                  notification click-through uses it), and the alternative is
                  passing a handler down through Column into every Card. */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.dispatchEvent(
                    new CustomEvent('open-task', { detail: { id: card._id } })
                  );
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="hover:bg-surface-strong rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                aria-label={`Open “${card.title}”`}
                title="Open task"
              >
                <MoreHorizontal size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Description */}
          {card.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{card.description}</p>
          )}

          {/* Tags */}
          {card.tags && card.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {card.tags.slice(0, 3).map((tag: string, i: number) => (
                <span key={i} className="bg-surface-strong inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:text-gray-300">
                  {tag}
                </span>
              ))}
              {card.tags.length > 3 && (
                <span className="inline-flex items-center px-1 text-[10px] text-gray-500 dark:text-gray-400">
                  +{card.tags.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PriorityBadge priority={card.priority || 'none'} />
              {card.dueDate && (
                <span className={cn(
                  'flex items-center gap-1 text-[10px]',
                  isOverdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                )}>
                  <Clock size={10} aria-hidden="true" />
                  {new Date(card.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {isOverdue && <span className="sr-only"> (overdue)</span>}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              {(card.comments?.length ?? 0) > 0 && (
                <span className="flex items-center gap-0.5 text-[10px]" title={`${card.comments!.length} comments`}>
                  <MessageSquare size={10} aria-hidden="true" />
                  {card.comments!.length}
                </span>
              )}
              {(card.subtasks?.length ?? 0) > 0 && (
                <span className="flex items-center gap-0.5 text-[10px]" title="Subtasks complete">
                  <CheckSquare size={10} aria-hidden="true" />
                  {card.subtasks!.filter((s: any) => s.completed).length}/{card.subtasks!.length}
                </span>
              )}
              {(card.attachments?.length ?? 0) > 0 && (
                <span className="flex items-center gap-0.5 text-[10px]" title={`${card.attachments!.length} attachments`}>
                  <Paperclip size={10} aria-hidden="true" />
                  {card.attachments!.length}
                </span>
              )}
            </div>
          </div>

          {/* Subtask progress bar */}
          {subtaskProgress >= 0 && (
            <div
              className="bg-surface-strong h-1 overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={subtaskProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Subtask progress"
            >
              <div
                className="h-full rounded-full bg-yellow-400 transition-all duration-500"
                style={{ width: `${subtaskProgress}%` }}
              />
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

const MemoCard = memo(Card);
const MemoColumn = memo(Column);

function DropIndicator({ beforeId, column }: { beforeId: string | null; column: string }) {
  return (
    <div
      data-before={beforeId || '-1'}
      data-column={column}
      className="my-0.5 h-0.5 w-full rounded-full bg-yellow-400 opacity-0 transition-opacity"
    />
  );
}

function BurnBarrel({ onDelete }: { onDelete: (id: string) => void }) {
  const [active, setActive] = useState(false);

  const handleDragOver = (e: DragEvent) => { e.preventDefault(); setActive(true); };
  const handleDragLeave = () => setActive(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('cardId');
    if (cardId && !cardId.startsWith('temp-')) {
      onDelete(cardId);
    }
    setActive(false);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        'mt-10 flex h-48 w-16 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-colors',
        active
          ? 'border-red-400 bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
          : 'border-hairline text-gray-500 hover:border-gray-300 dark:text-gray-400 dark:hover:border-gray-600'
      )}
      aria-label="Drop a task here to move it to Trash"
      title="Drop a task here to move it to Trash"
    >
      {active ? <Flame size={20} className="animate-bounce" aria-hidden="true" /> : <Trash2 size={18} aria-hidden="true" />}
      <span className="text-[10px] font-medium">Trash</span>
    </div>
  );
}
