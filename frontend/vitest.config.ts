import path from 'node:path';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import AutoImport from 'unplugin-auto-import/vite';
import { defineConfig } from 'vite-plus';

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
      components: path.resolve(__dirname, 'apps/admin/src/components'),
      composables: path.resolve(__dirname, 'apps/admin/src/composables'),
      config: path.resolve(__dirname, 'apps/admin/src/config'),
      pages: path.resolve(__dirname, 'apps/admin/src/pages'),
      styles: path.resolve(__dirname, 'apps/admin/src/styles'),
      utils: path.resolve(__dirname, 'apps/admin/src/utils'),
      src: path.resolve(__dirname, 'apps/admin/src'),
      contracts: path.resolve(__dirname, '../contracts/src'),
    },
  },
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
    globals: true,
    environment: 'happy-dom',
    include: ['apps/**/src/**/*.test.ts'],
    setupFiles: ['./setup-localstorage.ts'],
  },
});
