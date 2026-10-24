import { useEffect } from 'react';

/** The next click returns to play without also activating the control underneath. */
export function useOwnerInspectionDismissal(owner: string | null, dismiss: () => void) {
  useEffect(() => {
    if (!owner) return;
    const click = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    };
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [owner, dismiss]);
}
