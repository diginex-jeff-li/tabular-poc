/**
 * In-memory Storage polyfill for vitest.
 *
 * happy-dom does not provide a localStorage implementation. Without it,
 * VueUse useLocalStorage silently degrades to a non-persisting in-memory
 * fallback with no serializer support — tests pass while proving nothing.
 *
 * This polyfill is wired via `test.setupFiles` in vite.config.ts so that
 * globalThis.localStorage is available before any test runs.
 */

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    const keys = [...this.store.keys()];
    return keys[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// VueUse useStorage duck-types for addEventListener to register storage
// event listeners. Provide no-ops so the feature check passes.
interface StorageWithListeners extends Storage {
  addEventListener: () => void;
  removeEventListener: () => void;
}

const storage = new MemoryStorage() as StorageWithListeners;
storage.addEventListener = () => {};
storage.removeEventListener = () => {};

// Node 26 exposes localStorage as a read-only getter that returns undefined
// unless --localstorage-file is provided. Object.defineProperty can override
// a configurable getter; if that fails (non-configurable), fall back to
// direct assignment.
try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  });
} catch {
  (globalThis as unknown as { localStorage: Storage }).localStorage = storage;
}
