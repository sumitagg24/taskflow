import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog focus management for panels that do NOT use `Modal`
 * (`Modal` has its own identical machinery). While `isOpen`: ESC calls
 * `onClose`, Tab cycles inside `panelRef`, and focus returns to the opener
 * on unmount. No-op when closed.
 */
export function useFocusTrap(
  panelRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void
) {
  // Keep the latest onClose without re-subscribing: consumers pass inline
  // arrows that change identity every parent render. Re-running this effect
  // would restore "previously focused" repeatedly (focus flicker on mobile,
  // where soft-keyboard open/close re-renders the shell).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (nodes.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    requestAnimationFrame(() => {
      const target =
        panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panelRef.current;
      target?.focus({ preventScroll: true });
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
    // Only open/close transitions subscribe: refs are stable, onClose is read
    // via onCloseRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
}
