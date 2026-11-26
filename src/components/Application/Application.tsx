import UApp from '@nuxt/ui/components/App.vue';
import { defineComponent } from 'vue';
import { RouterView, useLink } from 'vue-router';
import type { VNode } from 'vue';

const NAV = [
  { to: '/', label: 'Compliance Library' },
  { to: '/invite-users', label: 'Invite Users' },
] as const;

const NAV_LINK =
  'rounded-md px-2.5 py-1 text-sm transition-transform duration-160 ease-out-strong motion-safe:active:scale-97';
const NAV_IDLE =
  'font-medium text-muted hover:bg-elevated hover:text-highlighted';
const NAV_CURRENT = 'bg-primary/10 font-semibold text-primary';

/**
 * Application shell — wraps every route with a slim nav header and the router
 * outlet.
 *
 * Layout contract (mandatory): the shell root is `flex h-screen flex-col`; the
 * header is `shrink-0` so it never compresses or scrolls away; the router
 * outlet is `flex-1 min-h-0` so the grid page's `h-full` resolves to a real
 * height and the grid's column headers sit entirely below the header's bottom
 * edge. No `100vh` arithmetic — the flex chain carries the height.
 *
 * Nav links: "Compliance Library" → `/` and "Invite Users" → `/invite-users`.
 * The current route's link is a tinted pill with `aria-current="page"`.
 *
 * PROTOTYPE — throwaway prototype code.
 */
export default defineComponent({
  name: 'Application',
  setup() {
    const links = NAV.map((item) => ({
      ...item,
      link: useLink({ to: item.to }),
    }));
    return (): VNode => (
      <UApp>
        <div class="flex h-screen flex-col">
          {/* ── Nav header (fixed, does not scroll away) ── */}
          <header class="flex h-11 shrink-0 items-center gap-6 border-b border-default bg-default px-4">
            <span class="text-sm font-semibold tracking-tight text-highlighted">
              Compliance Admin
            </span>
            <nav class="flex items-center gap-1">
              {links.map(({ to, label, link }) => {
                const current = link.isActive.value;
                return (
                  <a
                    key={to}
                    href={link.href.value}
                    aria-current={current ? 'page' : undefined}
                    class={[NAV_LINK, current ? NAV_CURRENT : NAV_IDLE]}
                    onClick={(e: MouseEvent) => void link.navigate(e)}
                  >
                    {label}
                  </a>
                );
              })}
            </nav>
          </header>

          {/* ── Router outlet (flex-1 min-h-0 — fills remaining space) ── */}
          <div class="router-outlet min-h-0 flex-1 overflow-hidden">
            <RouterView />
          </div>
        </div>
      </UApp>
    );
  },
});
