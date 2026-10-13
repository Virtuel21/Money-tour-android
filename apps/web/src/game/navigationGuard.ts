/** One extra history entry absorbs Back while the in-game confirmation is open. */
export function guardGameNavigation(onBack: () => void): () => void {
  const marker = 'moneyTourGameGuard';
  const url = location.href;
  const state = () => ({ ...(history.state ?? {}), [marker]: true });
  if (!history.state?.[marker]) history.pushState(state(), '', url);
  const back = () => {
    // Back has reached the base entry. Re-arm before opening the dialog, so
    // another press cannot silently leave while the confirmation is visible.
    history.pushState(state(), '', url);
    onBack();
  };
  const unload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('popstate', back);
  window.addEventListener('beforeunload', unload);
  return () => {
    window.removeEventListener('popstate', back);
    window.removeEventListener('beforeunload', unload);
    // Keep a single reusable guard entry across game/menu transitions.
  };
}
