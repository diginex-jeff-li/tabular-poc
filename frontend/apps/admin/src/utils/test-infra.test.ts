import { describe, it, expect, beforeEach } from 'vitest';
import { defineComponent, h, nextTick, type VNode } from 'vue';
import { mount } from '@vue/test-utils';
import { useLocalStorage } from '@vueuse/core';

describe('test infrastructure — localStorage polyfill and mounting', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('localStorage is available and round-trips values under vitest', () => {
    // Without the setup-localstorage.ts polyfill loaded via setupFiles,
    // globalThis.localStorage is undefined and every call below would throw.
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
    // This test guards against the silent VueUse in-memory fallback that
    // occurs when localStorage is undefined. Without the polyfill, the raw
    // localStorage key would never exist and the second useLocalStorage call
    // would return the default instead of the persisted value.
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
    const parsed = JSON.parse(raw as string);
    expect(parsed).toHaveLength(3);
    expect(parsed[2]).toEqual({ id: '3', name: 'Carol', role: 'user' });

    // A fresh useLocalStorage call on the same key reads the persisted value
    // from localStorage, proving the polyfill is real storage — not a no-op.
    const fresh = useLocalStorage<typeof data>(key, []);
    expect(fresh.value).toHaveLength(3);
    expect(fresh.value[0]).toEqual(data[0]);
  });

  it('@vue/test-utils mounts a defineComponent render function', () => {
    // Proves component-mounting tests are now possible in this repo.
    // The repo uses TSX defineComponent with render functions (no SFCs);
    // this test mirrors that pattern using h() for JSX-free verification.
    const TestComponent = defineComponent({
      name: 'TestMount',
      setup() {
        const msg = 'Hello from mounted component';
        return (): VNode => h('div', { class: 'test-mount' }, msg);
      },
    });

    const wrapper = mount(TestComponent);
    expect(wrapper.text()).toContain('Hello from mounted component');
    expect(wrapper.find('.test-mount').exists()).toBe(true);
  });
});
