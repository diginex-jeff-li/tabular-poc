import UApp from '@nuxt/ui/components/App.vue';
import { defineComponent, type VNode } from 'vue';

/**
 * Application shell — wraps every route with a slim nav header and the router
 * outlet.
 *
 * Layout contract (mandatory): the shell root is `flex h-screen flex-col`; the
 * header is `shrink-0` so it never compresses or scrolls away; the router
 * outlet is `flex-1 min-h-0` so the GridEditor's `h-full` resolves to a real
 * height and the grid's column headers sit entirely below the header's bottom
 * edge. No `100vh` arithmetic — the flex chain carries the height.
 *
 * Nav links in this milestone: only "Compliance Library" → `/`. The
 * "Custom Tables" link is deferred to milestone B, where it lands together
 * with the `/custom` routes, so no link ever dead-ends.
 *
 * PROTOTYPE — throwaway prototype code.
 */
export default defineComponent({
  name: 'Application',
  setup() {
    return (): VNode => (
      <UApp>
        <div class="flex h-screen flex-col">
          {/* ── Nav header (fixed, does not scroll away) ── */}
          <header class="flex shrink-0 items-center gap-4 border-b border-default bg-muted px-4 py-2">
            <span class="text-sm font-semibold text-highlighted">
              Compliance Admin
            </span>
            <nav class="flex items-center gap-3">
              <RouterLink
                to="/"
                class="text-sm text-muted hover:text-default"
                activeClass="font-semibold text-primary"
              >
                Compliance Library
              </RouterLink>
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
