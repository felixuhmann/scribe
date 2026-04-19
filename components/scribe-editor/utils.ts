export function useModLabel() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)
    ? '⌘'
    : 'Ctrl+';
}

export function focusDomExec(command: 'cut' | 'copy' | 'paste') {
  document.execCommand(command);
}
