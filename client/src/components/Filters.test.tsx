import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Filters, { EMPTY_FILTERS, SAVED_VIEWS_KEY, type FiltersValues } from './Filters';

const base: FiltersValues = { ...EMPTY_FILTERS };

/** Applies an onChange arg that may be a value or an updater. */
const resolve = (arg: unknown, prev: FiltersValues): FiltersValues =>
  typeof arg === 'function' ? (arg as (p: FiltersValues) => FiltersValues)(prev) : (arg as FiltersValues);

describe('Filters', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the search input and the four dropdowns', () => {
    render(<Filters filters={base} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Search tasks')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by status')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by priority')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by category')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort tasks')).toBeInTheDocument();
  });

  it('pushes status changes up immediately', () => {
    const onChange = vi.fn();
    render(<Filters filters={base} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'pending' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(resolve(onChange.mock.calls[0][0], base).status).toBe('pending');
  });

  it('pushes priority changes up immediately', () => {
    const onChange = vi.fn();
    render(<Filters filters={base} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Filter by priority'), { target: { value: 'high' } });

    expect(resolve(onChange.mock.calls[0][0], base).priority).toBe('high');
  });

  describe('search debouncing', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('does not push a request per keystroke', () => {
      const onChange = vi.fn();
      render(<Filters filters={base} onChange={onChange} />);
      const input = screen.getByLabelText('Search tasks');

      fireEvent.change(input, { target: { value: 'r' } });
      fireEvent.change(input, { target: { value: 're' } });
      fireEvent.change(input, { target: { value: 'rep' } });
      expect(onChange).not.toHaveBeenCalled();

      act(() => { vi.advanceTimersByTime(300); });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(resolve(onChange.mock.calls[0][0], base).search).toBe('rep');
    });
  });

  it('shows a clear control only when something is filtered', () => {
    const { unmount } = render(<Filters filters={base} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument();
    unmount();

    render(<Filters filters={{ ...base, status: 'pending' }} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Clear all filters' })).toBeInTheDocument();
  });

  it('resets every field when cleared, including the date window', () => {
    const onChange = vi.fn();
    render(
      <Filters
        filters={{ ...base, status: 'pending', priority: 'high', dueDateBefore: '2026-09-02T23:59:59' }}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));

    expect(resolve(onChange.mock.calls[0][0], base)).toEqual(EMPTY_FILTERS);
  });

  it('counts the active filters in the clear label', () => {
    render(<Filters filters={{ ...base, status: 'pending', priority: 'high' }} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Clear all filters' })).toHaveTextContent('Clear (2)');
  });

  describe('smart views', () => {
    it('applies a date window and sort when toggled on', () => {
      const onChange = vi.fn();
      render(<Filters filters={base} onChange={onChange} />);

      fireEvent.click(screen.getByRole('button', { name: 'Due today' }));

      const next = resolve(onChange.mock.calls[0][0], base);
      expect(next.sort).toBe('dueDate');
      expect(next.dueDateAfter).toMatch(/T00:00:00$/);
      expect(next.dueDateBefore).toMatch(/T23:59:59$/);
      expect(next.dueDateAfter.slice(0, 10)).toBe(next.dueDateBefore.slice(0, 10));
    });

    it('marks the matching view as pressed and clears it when toggled off', () => {
      const onChange = vi.fn();
      const { rerender } = render(<Filters filters={base} onChange={onChange} />);

      fireEvent.click(screen.getByRole('button', { name: 'Critical' }));
      const applied = resolve(onChange.mock.calls[0][0], base);
      rerender(<Filters filters={applied} onChange={onChange} />);

      const chip = screen.getByRole('button', { name: 'Critical' });
      expect(chip).toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(chip);
      const cleared = resolve(onChange.mock.calls[1][0], applied);
      expect(cleared.priority).toBe('');
      expect(cleared.sort).toBe('');
    });

    it('replaces a previous date window rather than merging two', () => {
      const onChange = vi.fn();
      const overdue = { ...base, dueDateBefore: '2026-09-01T23:59:59', sort: 'dueDate' };
      render(<Filters filters={overdue} onChange={onChange} />);

      fireEvent.click(screen.getByRole('button', { name: 'Next 7 days' }));

      const next = resolve(onChange.mock.calls[0][0], overdue);
      expect(next.dueDateAfter).not.toBe('');
      expect(next.dueDateBefore).not.toBe('2026-09-01T23:59:59');
    });
  });

  describe('saved views', () => {
    it('saves the current filters under a name and persists them', () => {
      const onChange = vi.fn();
      render(<Filters filters={{ ...base, status: 'in-progress', tag: 'urgent' }} onChange={onChange} />);

      fireEvent.click(screen.getByRole('button', { name: /save view/i }));
      fireEvent.change(screen.getByLabelText('Name this view'), { target: { value: 'Doing now' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save view' }));

      const stored = JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) ?? '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('Doing now');
      expect(stored[0].filters.status).toBe('in-progress');
      expect(screen.getByRole('button', { name: 'Doing now' })).toBeInTheDocument();
    });

    it('restores a saved view on click', () => {
      localStorage.setItem(
        SAVED_VIEWS_KEY,
        JSON.stringify([{ id: '1', name: 'Backlog grooming', filters: { ...base, status: 'backlog' } }])
      );
      const onChange = vi.fn();
      render(<Filters filters={base} onChange={onChange} />);

      fireEvent.click(screen.getByRole('button', { name: 'Backlog grooming' }));

      expect(resolve(onChange.mock.calls[0][0], base)).toEqual({ ...EMPTY_FILTERS, status: 'backlog' });
    });

    it('deletes a saved view', () => {
      localStorage.setItem(
        SAVED_VIEWS_KEY,
        JSON.stringify([{ id: '1', name: 'Temp', filters: { ...base, status: 'review' } }])
      );
      render(<Filters filters={base} onChange={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Delete saved view “Temp”' }));

      expect(JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) ?? '[]')).toHaveLength(0);
      expect(screen.queryByRole('button', { name: /^temp$/i })).not.toBeInTheDocument();
    });

    it('survives corrupt localStorage without throwing', () => {
      localStorage.setItem(SAVED_VIEWS_KEY, '{not json');
      expect(() => render(<Filters filters={base} onChange={vi.fn()} />)).not.toThrow();
    });
  });

  it('removes a single filter from the active chip row', () => {
    const onChange = vi.fn();
    const filters = { ...base, status: 'pending', category: 'work' };
    render(<Filters filters={filters} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove filter Work' }));

    expect(resolve(onChange.mock.calls[0][0], filters)).toEqual({ ...filters, category: '' });
  });
});
