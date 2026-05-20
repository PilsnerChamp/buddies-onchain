import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ROW_SELECTOR = '.hover-row:not(.hover-row--inert)';
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const ARROW_OWNING_INPUT_TYPES = new Set([
  'date',
  'datetime-local',
  'email',
  'month',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'time',
  'url',
  'week',
]);

export function useArrowRowNav(): void {
  const location = useLocation();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      if (event.altKey || event.metaKey || event.ctrlKey || event.isComposing) {
        return;
      }
      if (isEditableTarget(event.target)) return;

      const rows = Array.from(document.querySelectorAll<HTMLElement>(ROW_SELECTOR));
      if (rows.length === 0) return;

      event.preventDefault();

      const activeElement = document.activeElement;
      const currentIndex = rows.findIndex(
        (row) => row === activeElement || row.contains(activeElement),
      );
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex =
        currentIndex === -1
          ? direction === 1
            ? 0
            : rows.length - 1
          : (currentIndex + direction + rows.length) % rows.length;

      focusTargetFor(rows[nextIndex]).focus();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [location]);
}

function focusTargetFor(row: HTMLElement): HTMLElement {
  if (row.matches(FOCUSABLE_SELECTOR)) return row;
  return row.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? row;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) {
    return (
      !target.classList.contains('view-action__input') &&
      ARROW_OWNING_INPUT_TYPES.has(target.type)
    );
  }
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  return target.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}
