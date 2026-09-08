export const DATA_CHANGED_EVENT = "pipemind:data-changed";

export function notifyDataChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
  }
}

export function onDataChanged(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {
      void 0;
    };
  }
  window.addEventListener(DATA_CHANGED_EVENT, listener);
  return () => {
    window.removeEventListener(DATA_CHANGED_EVENT, listener);
  };
}
