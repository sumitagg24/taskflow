import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Filters from './Filters';

const defaultFilters = {
  status: '',
  priority: '',
  sort: '',
  search: '',
  category: '',
  tag: '',
};

describe('Filters', () => {
  it('renders search input', () => {
    render(<Filters filters={defaultFilters} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('Search tasks...')).toBeInTheDocument();
  });

  it('renders all filter dropdown options', () => {
    render(<Filters filters={defaultFilters} onChange={vi.fn()} />);
    // Check that option texts are present
    expect(screen.getByText('All Status')).toBeInTheDocument();
    expect(screen.getByText('All Priority')).toBeInTheDocument();
    expect(screen.getByText('All Categories')).toBeInTheDocument();
  });

  it('calls onChange when search input changes', () => {
    const onChange = vi.fn();
    render(<Filters filters={defaultFilters} onChange={onChange} />);

    const searchInput = screen.getByPlaceholderText('Search tasks...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    // onChange receives an updater function (React.Dispatch pattern)
    expect(onChange).toHaveBeenCalled();
    const updater = onChange.mock.calls[0][0];
    expect(typeof updater).toBe('function');
    // When called with current state, it should return updated state
    const result = updater(defaultFilters);
    expect(result.search).toBe('test');
  });

  it('calls onChange with updater when status select changes', () => {
    const onChange = vi.fn();
    render(<Filters filters={defaultFilters} onChange={onChange} />);

    // Find all select elements
    const selects = screen.getAllByRole('combobox');
    // First select is status
    fireEvent.change(selects[0], { target: { value: 'pending' } });

    expect(onChange).toHaveBeenCalled();
    const updater = onChange.mock.calls[0][0];
    expect(typeof updater).toBe('function');
    const result = updater(defaultFilters);
    expect(result.status).toBe('pending');
  });

  it('calls onChange with updater when priority select changes', () => {
    const onChange = vi.fn();
    render(<Filters filters={defaultFilters} onChange={onChange} />);

    const selects = screen.getAllByRole('combobox');
    // Second select is priority
    fireEvent.change(selects[1], { target: { value: 'high' } });

    expect(onChange).toHaveBeenCalled();
    const updater = onChange.mock.calls[0][0];
    const result = updater(defaultFilters);
    expect(result.priority).toBe('high');
  });

  it('shows clear button when filters are active', () => {
    const filtersWithStatus = { ...defaultFilters, status: 'pending' };
    render(<Filters filters={filtersWithStatus} onChange={vi.fn()} />);

    expect(screen.getByText(/Clear/)).toBeInTheDocument();
  });

  it('calls onChange with reset state when clear button is clicked', () => {
    const onChange = vi.fn();
    const filtersWithStatus = { ...defaultFilters, status: 'pending', priority: 'high' };
    render(<Filters filters={filtersWithStatus} onChange={onChange} />);

    const clearButton = screen.getByText(/Clear/);
    fireEvent.click(clearButton);

    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls[0][0];
    const result = typeof arg === 'function' ? arg(defaultFilters) : arg;
    expect(result).toEqual({
      status: '',
      priority: '',
      sort: '',
      search: '',
      category: '',
      tag: '',
    });
  });

  it('does not show clear button when no filters are active', () => {
    render(<Filters filters={defaultFilters} onChange={vi.fn()} />);
    expect(screen.queryByText(/Clear/)).not.toBeInTheDocument();
  });

  it('shows filter count in clear button', () => {
    const filtersWithFilters = { ...defaultFilters, status: 'pending', priority: 'high' };
    render(<Filters filters={filtersWithFilters} onChange={vi.fn()} />);

    expect(screen.getByText(/Clear.*2/)).toBeInTheDocument();
  });
});
