const inflight = new Map<string, Promise<void>>();

/** Run `fn` once per process; retry later if it fails. */
export function runOnce(key: string, fn: () => Promise<void>): Promise<void> {
  let pending = inflight.get(key);
  if (!pending) {
    pending = fn().catch((error) => {
      inflight.delete(key);
      throw error;
    });
    inflight.set(key, pending);
  }
  return pending;
}
