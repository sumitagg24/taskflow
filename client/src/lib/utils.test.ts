import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('merges class names correctly', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('merges Tailwind classes correctly (later wins)', () => {
    expect(cn('px-4', 'px-6')).toBe('px-6');
  });

  it('handles undefined and null values', () => {
    expect(cn('a', undefined, null, 'b')).toBe('a b');
  });

  it('handles empty inputs', () => {
    expect(cn()).toBe('');
  });

  it('handles array of classes', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c');
  });
});
