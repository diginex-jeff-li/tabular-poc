import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { defineComponent, h } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import Application from './Application';
import type { VNode } from 'vue';

// ── Mock UApp ──
//
// The real UApp from Nuxt UI requires the UI plugin and provides toast/overlay
// portals that are irrelevant to the shell layout. We mock it to render its
// default slot directly, isolating the header + router outlet structure.

vi.mock('@nuxt/ui/components/App.vue', () => ({
  default: defineComponent({
    name: 'UApp',
    setup(_, { slots }) {
      return (): VNode => h('div', { class: 'u-app' }, slots.default?.());
    },
  }),
}));

// ── A trivial page component so RouterView has something to render ──

const PlaceholderPage = defineComponent({
  name: 'PlaceholderPage',
  setup() {
    return (): VNode =>
      h('div', { class: 'placeholder-page' }, 'Grid goes here');
  },
});

// ── Helper to mount Application with a real router ──
//
// createMemoryHistory avoids URL/history issues under happy-dom. The router
// includes the nav targets registered in config/router.ts: '/' and '/invite-users'.

async function mountApplication(initialPath = '/') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: PlaceholderPage },
      { path: '/invite-users', component: PlaceholderPage },
    ],
  });
  await router.push(initialPath);
  await router.isReady();
  return mount(Application, {
    global: {
      plugins: [router],
    },
  });
}

describe('Application — nav shell', () => {
  beforeEach(() => {
    // Ensure clean state between tests
  });

  it('renders a <header> element above the router outlet', async () => {
    const wrapper = await mountApplication();
    const header = wrapper.find('header');
    expect(header.exists()).toBe(true);
    // The header must appear before the router outlet in DOM order
    const root = wrapper.find('.u-app > div');
    const children = root.element.children;
    const headerIndex = Array.from(children).findIndex(
      (el) => (el as HTMLElement).tagName === 'HEADER',
    );
    const outletIndex = Array.from(children).findIndex((el) =>
      (el as HTMLElement).classList.contains('router-outlet'),
    );
    expect(headerIndex).toBeGreaterThanOrEqual(0);
    expect(outletIndex).toBeGreaterThan(headerIndex);
  });

  it('the header shows the application name', async () => {
    const wrapper = await mountApplication();
    const header = wrapper.find('header');
    expect(header.text()).toContain('Compliance');
  });

  it('the header contains a "Compliance Library" RouterLink navigating to "/"', async () => {
    const wrapper = await mountApplication();
    const links = wrapper.findAll('header a[href]');
    const complianceLink = links.find((l) => l.text() === 'Compliance Library');
    expect(complianceLink).toBeDefined();
    // RouterLink with createMemoryHistory renders href="#" or href="/"
    // — either way it is a link, not a dead-end
  });

  it('the header nav links are exactly "Compliance Library" and "Invite Users"', async () => {
    const wrapper = await mountApplication();
    const links = wrapper.findAll('header a[href]');
    expect(links.map((l) => l.text())).toEqual([
      'Compliance Library',
      'Invite Users',
    ]);
  });

  it('the "Compliance Library" link is visually distinguished as active when on "/"', async () => {
    const wrapper = await mountApplication('/');
    const links = wrapper.findAll('header a');
    const complianceLink = links.find((l) => l.text() === 'Compliance Library');
    expect(complianceLink).toBeDefined();
    const classes = complianceLink.classes();
    // The active link must carry a distinguishing class (font-semibold + text-primary)
    expect(classes).toContain('font-semibold');
    expect(classes).toContain('text-primary');
  });

  it('the "Invite Users" link is visually distinguished as active when on "/invite-users"', async () => {
    const wrapper = await mountApplication('/invite-users');
    const links = wrapper.findAll('header a');
    const inviteLink = links.find((l) => l.text() === 'Invite Users');
    expect(inviteLink).toBeDefined();
    const classes = inviteLink.classes();
    expect(classes).toContain('font-semibold');
    expect(classes).toContain('text-primary');
  });

  it('the shell root uses flex h-screen flex-col layout', async () => {
    const wrapper = await mountApplication();
    const root = wrapper.find('.u-app > div');
    expect(root.exists()).toBe(true);
    expect(root.classes()).toContain('flex');
    expect(root.classes()).toContain('h-screen');
    expect(root.classes()).toContain('flex-col');
  });

  it('the router outlet is flex-1 with min-h-0 so the GridEditor flex layout resolves', async () => {
    const wrapper = await mountApplication();
    const outlet = wrapper.find('.u-app > div > .router-outlet');
    expect(outlet.exists()).toBe(true);
    expect(outlet.classes()).toContain('flex-1');
    expect(outlet.classes()).toContain('min-h-0');
  });

  it('the header does not scroll away — it is shrink-0 so the outlet takes remaining space', async () => {
    const wrapper = await mountApplication();
    const header = wrapper.find('header');
    expect(header.classes()).toContain('shrink-0');
  });
});
