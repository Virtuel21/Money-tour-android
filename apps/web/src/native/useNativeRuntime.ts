import { useEffect, useRef } from 'react';
import { installNativeRuntime, type NativeRuntimeCallbacks } from './runtime';

/** Keep one set of native listeners while callback closures follow the current game. */
export function useNativeRuntime(callbacks: NativeRuntimeCallbacks) {
  const current = useRef(callbacks);
  current.current = callbacks;
  useEffect(
    () =>
      installNativeRuntime({
        onBack: () => current.current.onBack(),
        onActiveChange: (active) => current.current.onActiveChange(active),
        onInvitation: (hash) => current.current.onInvitation(hash),
      }),
    [],
  );
}
