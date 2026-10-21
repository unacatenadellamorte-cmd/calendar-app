const listeners = new Set<() => void>();

export function subscribeDataRefresh(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyDataRefresh() {
  for (const listener of listeners) listener();
}
