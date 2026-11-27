import { useLocalStorage } from '@vueuse/core';
import { describe, it, expect, beforeEach } from 'vite-plus/test';
import { nextTick } from 'vue';

describe('test infrastructure — localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('localStorage is available and round-trips values under vitest', () => {
    expect(localStorage).toBeDefined();
    expect(localStorage.getItem('missing')).toBeNull();

    localStorage.setItem('foo', 'bar');
    expect(localStorage.getItem('foo')).toBe('bar');
    expect(localStorage.length).toBe(1);

    localStorage.removeItem('foo');
    expect(localStorage.getItem('foo')).toBeNull();
    expect(localStorage.length).toBe(0);

    localStorage.setItem('a', '1');
    localStorage.setItem('b', '2');
    expect(localStorage.length).toBe(2);
    localStorage.clear();
    expect(localStorage.length).toBe(0);
  });

  it('useLocalStorage from @vueuse/core persists an array of objects', async () => {
    const key = 'sc-test-array';
    const data = [
      { id: '1', name: 'Alice', role: 'admin' },
      { id: '2', name: 'Bob', role: 'user' },
    ];

    const stored = useLocalStorage(key, []);

    // Mutating the ref must write through to the raw localStorage.
    // VueUse uses a flush:'pre' watcher, so we await nextTick to let it
    // persist before reading the raw storage back.
    stored.value = [...data, { id: '3', name: 'Carol', role: 'user' }];
    await nextTick();

    const raw = localStorage.getItem(key);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveLength(3);
    expect(parsed[2]).toEqual({ id: '3', name: 'Carol', role: 'user' });

    // A fresh useLocalStorage call on the same key reads the persisted value
    // from localStorage, proving it is real storage — not a no-op.
    const fresh = useLocalStorage<typeof data>(key, []);
    expect(fresh.value).toHaveLength(3);
    expect(fresh.value[0]).toEqual(data[0]);
  });
});
