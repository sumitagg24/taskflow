import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders children text', () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByText('Click Me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabled>Disabled</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('has disabled attribute when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('disabled');
  });

  it('shows loading spinner when loading is true', () => {
    render(<Button loading>Loading</Button>);
    const button = screen.getByRole('button');
    // Button should be disabled when loading
    expect(button).toHaveAttribute('disabled');
    // Loading spinner should render (Loader2 with animate-spin class)
    const spinner = button.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
  });

  it('has button role', () => {
    render(<Button>Test</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('applies outline variant', () => {
    render(<Button variant="outline">Outline</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('border');
  });

  it('applies secondary variant', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-gray');
  });

  it('renders with icon before text', () => {
    render(<Button icon={<span data-testid="test-icon">🔍</span>}>Search</Button>);
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  it('renders with sm size classes', () => {
    render(<Button size="sm">Small</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('h-8');
    expect(button.className).toContain('text-xs');
  });

  it('renders with lg size classes', () => {
    render(<Button size="lg">Large</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('h-12');
    expect(button.className).toContain('text-base');
  });

  it('passes type attribute', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });
});
