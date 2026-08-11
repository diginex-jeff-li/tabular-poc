import UApp from '@nuxt/ui/components/App.vue';
import { defineComponent, type VNode } from 'vue';

export default defineComponent({
  setup() {
    return (): VNode => (
      <UApp>
        <div class="flex h-screen flex-col">
          <div class="min-h-0 flex-1 overflow-hidden">
            <RouterView />
          </div>
        </div>
      </UApp>
    );
  },
});
