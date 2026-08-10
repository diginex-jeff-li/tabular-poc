import path from 'node:path';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import AutoImport from 'unplugin-auto-import/vite';

export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    AutoImport({
      imports: [
        'vue',
        {
          'vue-router': [
            'useRoute',
            'useRouter',
            'createRouter',
            'createWebHistory',
            'RouterLink',
            'RouterView',
          ],
          pinia: ['defineStore', 'createPinia'],
          '@pinia/colada': [
            'useQuery',
            'useMutation',
            'PiniaColada',
            'defineQuery',
            'defineMutation',
            'useQueryCache',
            'useMutationCache',
          ],
          '@pinia/colada-plugin-retry': ['PiniaColadaRetry'],
        },
        {
          from: 'vue',
          imports: ['PropType', 'Ref', 'MaybeRef', 'MaybeRefOrGetter'],
          type: true,
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      apis: path.resolve(__dirname, 'apps/admin/src/apis'),
      components: path.resolve(__dirname, 'apps/admin/src/components'),
      config: path.resolve(__dirname, 'apps/admin/src/config'),
      pages: path.resolve(__dirname, 'apps/admin/src/pages'),
      styles: path.resolve(__dirname, 'apps/admin/src/styles'),
      src: path.resolve(__dirname, 'apps/admin/src'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['apps/**/src/**/*.test.tsx', 'apps/**/src/**/*.test.ts'],
  },
});
