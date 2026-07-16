import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, StatusBadge, PriorityBadge } from './Badge';

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Test Badge</Badge>);
    expect(screen.getByText('Test Badge')).toBeInTheDocument();
  });

  it('applies default variant classes', () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText('Default');
    expect(badge.className).toContain('rounded-full');
  });

  it('applies primary variant classes', () => {
    render(<Badge variant="primary">Primary</Badge>);
    const badge = screen.getByText('Primary');
    expect(badge.className).toContain('bg-yellow');
  });

  it('applies danger variant classes', () => {
    render(<Badge variant="danger">Danger</Badge>);
    const badge = screen.getByText('Danger');
    expect(badge.className).toContain('bg-red');
  });

  it('applies custom className', () => {
    render(<Badge className="custom-class">Custom</Badge>);
    const badge = screen.getByText('Custom');
    expect(badge.className).toContain('custom-class');
  });

  it('renders with sm size by default', () => {
    render(<Badge>Small</Badge>);
    const badge = screen.getByText('Small');
    expect(badge.className).toContain('text-xs');
  });

  it('renders with md size', () => {
    render(<Badge size="md">Medium</Badge>);
    const badge = screen.getByText('Medium');
    expect(badge.className).toContain('text-sm');
  });
});

describe('StatusBadge', () => {
  it('renders pending status', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('To Do')).toBeInTheDocument();
  });

  it('renders completed status', () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders in-progress status', () => {
    render(<StatusBadge status="in-progress" />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders backlog status', () => {
    render(<StatusBadge status="backlog" />);
    expect(screen.getByText('Backlog')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<StatusBadge status="pending" className="extra-class" />);
    expect(screen.getByText('To Do').className).toContain('extra-class');
  });
});

describe('PriorityBadge', () => {
  it('renders critical priority with emoji', () => {
    render(<PriorityBadge priority="critical" />);
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('🔴')).toBeInTheDocument();
  });

  it('renders high priority', () => {
    render(<PriorityBadge priority="high" />);
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('🟠')).toBeInTheDocument();
  });

  it('renders medium priority', () => {
    render(<PriorityBadge priority="medium" />);
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('🟡')).toBeInTheDocument();
  });

  it('renders low priority', () => {
    render(<PriorityBadge priority="low" />);
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('renders none priority without emoji', () => {
    render(<PriorityBadge priority="none" />);
    expect(screen.getByText('None')).toBeInTheDocument();
  });
});
