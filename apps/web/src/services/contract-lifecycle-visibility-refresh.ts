const WINDOW_VISIBILITY_MARKER = '__contractLifecycleVisibilityRefreshInstalled__';

type MarkedWindow = Window & {
  [WINDOW_VISIBILITY_MARKER]?: boolean;
};

export const shouldRefreshContractLifecycleOnVisibility = (
  visibilityState: DocumentVisibilityState
) => visibilityState === 'visible';

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const markedWindow = window as MarkedWindow;

  if (!markedWindow[WINDOW_VISIBILITY_MARKER]) {
    document.addEventListener('visibilitychange', () => {
      if (shouldRefreshContractLifecycleOnVisibility(document.visibilityState)) {
        window.dispatchEvent(new Event('focus'));
      }
    });

    markedWindow[WINDOW_VISIBILITY_MARKER] = true;
  }
}
