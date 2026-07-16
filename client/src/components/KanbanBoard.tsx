import { useState, useCallback, useRef, useMemo, useEffect, DragEvent, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MoreHorizontal, GripVertical, Trash2, Flame, MessageSquare, CheckSquare, Clock, Paperclip, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PriorityBadge } from './ui/Badge';
import { updateTask, deleteTask, createTask, batchUpdate, timeTrackingAPI } from '@/api/tasks';
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
  { id: 'backlog', title: 'Backlog', color: 'text-gray-400' },
  { id: 'pending', title: 'To Do', color: 'text-blue-500' },
  { id: 'in-progress', title: 'In Progress', color: 'text-orange-500' },
  { id: 'completed', title: 'Completed', color: 'text-green-500' },
];

const columnBgColors: Record<string, string> = {
  backlog: 'bg-gray-50 dark:bg-gray-800/30',
  pending: 'bg-blue-50/50 dark:bg-blue-500/5',
  'in-progress': 'bg-orange-50/50 dark:bg-orange-500/5',
  completed: 'bg-green-50/50 dark:bg-green-500/5',
};

interface KanbanBoardProps {
  tasks: CardType[];
  onRefresh: () => void;
  onEdit: (task: any) => void;
  onDelete?: (task: any) => void;
}

export default function KanbanBoard({ tasks, onRefresh, onEdit, onDelete }: KanbanBoardProps) {
  const [cards, setCards] = useState<CardType[]>(tasks);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [timeTrackTask, setTimeTrackTask] = useState<CardType | null>(null);

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

  const updateCardStatus = useCallback(async (cardId: string, newStatus: string) => {
    // Optimistic UI update
    setCards(prev => prev.map(c => c._id === cardId ? { ...c, status: newStatus } : c));
    try {
      await updateTask(cardId, { status: newStatus });
      toast.success(`Task moved to ${columns.find(c => c.id === newStatus)?.title}`);
    } catch {
      toast.error('Failed to update task');
      onRefresh();
    }
  }, [onRefresh]);

  const handleDeleteCard = useCallback(async (cardId: string) => {
    const card = cards.find(c => c._id === cardId);
    if (onDelete && card) {
      onDelete(card);
    } else {
      // Fallback direct delete (for BurnBarrel)
      try {
        await deleteTask(cardId);
        setCards(pv => pv.filter(c => c._id !== cardId));
        setSelected(prev => {
          if (!prev.has(cardId)) return prev;
          const next = new Set(prev);
          next.delete(cardId);
          return next;
        });
        toast.success('Task deleted');
      } catch {
        toast.error('Failed to delete task');
      }
    }
  }, [cards, onDelete]);

  const handleBurnDelete = useCallback(async (cardId: string) => {
    try {
      await deleteTask(cardId);
      setCards(pv => pv.filter(c => c._id !== cardId));
      setSelected(prev => {
        if (!prev.has(cardId)) return prev;
        const next = new Set(prev);
        next.delete(cardId);
        return next;
      });
      toast.success('Task deleted');
    } catch {
      toast.error('Failed to delete task');
    }
  }, []);

  const handleAddCard = useCallback(async (title: string, column: ColumnType) => {
    const tempId = `temp-${Math.random()}`;
    const tempCard: CardType = { _id: tempId, title, status: column };
    setCards(pv => [...pv, tempCard]);

    try {
      const { data } = await createTask({ title, status: column });
      setCards(pv => pv.map(c => c._id === tempId ? { ...data, status: column } : c));
      toast.success('Task created');
    } catch {
      setCards(pv => pv.filter(c => c._id !== tempId));
      toast.error('Failed to create task');
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

  const handleBulkStatus = useCallback(async (status: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      await batchUpdate(ids, { status });
      setCards(prev => prev.map(c => selected.has(c._id) ? { ...c, status } : c));
      toast.success(`${ids.length} task${ids.length === 1 ? '' : 's'} updated`);
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

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected task${ids.length === 1 ? '' : 's'}?`)) return;
    try {
      await Promise.all(ids.map(id => deleteTask(id)));
      setCards(prev => prev.filter(c => !selected.has(c._id)));
      toast.success(`${ids.length} task${ids.length === 1 ? '' : 's'} deleted`);
      clearSelection();
    } catch {
      toast.error('Bulk delete failed');
    }
  }, [selected, clearSelection]);

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
            <Column
              key={col.id}
              title={col.title}
              column={col.id}
              headingColor={col.color}
              bgColor={columnBgColors[col.id]}
              cards={columnCards}
              onUpdateStatus={updateCardStatus}
              onDelete={handleDeleteCard}
              onEdit={onEdit}
              onAddCard={handleAddCard}
              selected={selected}
              onToggleSelect={toggleSelect}
              onStartTimer={(card) => setTimeTrackTask(card)}
            />
          );
        })}
        <BurnBarrel onDelete={handleBurnDelete} />
      </div>

      <AnimatePresence>
        {selected.size > 0 && (
          <BulkActionsBar
            selectedCount={selected.size}
            totalTasks={cards.length}
            onSelectStatus={handleBulkStatus}
            onSelectPriority={handleBulkPriority}
            onDelete={handleBulkDelete}
            onSelectTags={handleBulkTag}
            existingTags={selectedTags}
            onClose={clearSelection}
          />
        )}
      </AnimatePresence>

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
  onEdit: (task: any) => void;
  onAddCard: (title: string, col: ColumnType) => void;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onStartTimer: (task: CardType) => void;
}

function Column({ title, headingColor, bgColor, cards, column, onUpdateStatus, onDelete, onEdit, onAddCard, selected, onToggleSelect, onStartTimer }: ColumnProps) {
  const [active, setActive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
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
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <h3 className={cn('text-sm font-semibold uppercase tracking-wider', headingColor)}>{title}</h3>
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800 text-[10px] font-medium text-gray-500">
            {cards.length}
          </span>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>

      <div
        onDrop={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'flex flex-col gap-2 rounded-2xl p-3 transition-colors min-h-[200px]',
          active ? 'bg-yellow-50/50 dark:bg-yellow-500/10 ring-2 ring-yellow-400/30' : bgColor
        )}
      >
        <AnimatePresence>
          {cards.length === 0 && !adding && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-10 text-center"
            >
              <p className="text-xs text-gray-400">Drop tasks here</p>
            </motion.div>
          )}
          {cards.map(c => (
            <Card
              key={c._id}
              card={c}
              onDragStart={handleDragStart}
              onDelete={onDelete}
              onEdit={onEdit}
              isSelected={selected.has(c._id)}
              onToggleSelect={onToggleSelect}
              onStartTimer={onStartTimer}
            />
          ))}
        </AnimatePresence>
        <DropIndicator beforeId={null} column={column} />

        {/* Add Card Form */}
        {adding ? (
          <motion.form
            layout
            onSubmit={handleAddSubmit}
            className="rounded-xl border border-yellow-400/30 bg-yellow-50 dark:bg-yellow-500/5 p-3"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              placeholder="Add new task..."
              className="w-full resize-none bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddSubmit(e);
                }
              }}
            />
            <div className="mt-2 flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => { setAdding(false); setText(''); }}
                className="rounded-lg px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-yellow-400 px-3 py-1 text-xs font-semibold text-gray-900 hover:bg-yellow-500 transition-colors"
              >
                Add
              </button>
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
  onEdit: (task: any) => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onStartTimer: (task: CardType) => void;
}

function Card({ card, onDragStart, onDelete, onEdit, isSelected, onToggleSelect, onStartTimer }: CardProps) {
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
          'group cursor-grab rounded-xl border bg-white dark:bg-gray-800/80 p-3.5 transition-all hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-black/20 active:cursor-grabbing',
          isOverdue ? 'border-red-200 dark:border-red-500/30' : 'border-gray-100 dark:border-gray-700/50',
          isSelected && 'ring-2 ring-yellow-400'
        )}
        style={{ borderLeftWidth: '3px', borderLeftColor: card.priority === 'critical' ? '#DC2626' : card.priority === 'high' ? '#F97316' : card.priority === 'medium' ? '#FACC15' : '#E5E7EB' }}
      >
        <div
          draggable="true"
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
                  : 'border-gray-300 dark:border-gray-600 hover:border-yellow-400'
              )}
              title={isSelected ? 'Deselect' : 'Select for bulk action'}
            >
              {isSelected && <CheckSquare size={12} />}
            </button>
            <GripVertical size={14} className="mt-0.5 shrink-0 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">{card.title}</p>
            </div>
            <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); onStartTimer(card); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-yellow-500 transition-colors"
                title="Start time tracking"
              >
                <Timer size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(card); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <MoreHorizontal size={14} />
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
                <span key={i} className="inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:text-gray-300">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PriorityBadge priority={card.priority || 'none'} />
              {card.dueDate && (
                <span className={cn(
                  'flex items-center gap-1 text-[10px]',
                  isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'
                )}>
                  <Clock size={10} />
                  {new Date(card.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              {(card.comments?.length ?? 0) > 0 && (
                <span className="flex items-center gap-0.5 text-[10px]">
                  <MessageSquare size={10} />
                  {card.comments!.length}
                </span>
              )}
              {(card.subtasks?.length ?? 0) > 0 && (
                <span className="flex items-center gap-0.5 text-[10px]">
                  <CheckSquare size={10} />
                  {card.subtasks!.filter((s: any) => s.completed).length}/{card.subtasks!.length}
                </span>
              )}
              {(card.attachments?.length ?? 0) > 0 && (
                <span className="flex items-center gap-0.5 text-[10px]">
                  <Paperclip size={10} />
                  {card.attachments!.length}
                </span>
              )}
            </div>
          </div>

          {/* Subtask progress bar */}
          {subtaskProgress >= 0 && (
            <div className="h-1 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
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
        'flex h-48 w-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-all mt-10',
        active ? 'border-red-400 bg-red-50 dark:bg-red-500/10 text-red-500' : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
      )}
    >
      {active ? <Flame size={20} className="animate-bounce" /> : <Trash2 size={18} />}
      <span className="text-[10px] font-medium">Trash</span>
    </div>
  );
}
