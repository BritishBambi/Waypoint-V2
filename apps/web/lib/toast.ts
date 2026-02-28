// Minimal toast system — no external dependencies, no React context.
// Any component calls toast() to push a message; the Toaster component
// subscribes and renders whatever is in the queue.

export type ToastEntry = {
  id: string;
  message: string;
  kind: "success" | "error";
};

type Listener = (entries: ToastEntry[]) => void;

let entries: ToastEntry[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l(entries));
}

/** Show a toast. Automatically dismissed after 3.5 seconds. */
export function toast(message: string, kind: ToastEntry["kind"] = "success") {
  const id = Math.random().toString(36).slice(2, 9);
  entries = [...entries, { id, message, kind }];
  emit();
  setTimeout(() => {
    entries = entries.filter((e) => e.id !== id);
    emit();
  }, 3500);
}

/** Subscribe to toast changes. Returns an unsubscribe function (for useEffect). */
export function subscribeToasts(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
