/// <reference types="vitest" />
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import ui from '@nuxt/ui/vite';
import AutoImport from 'unplugin-auto-import/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../..'), '');

  return {
    base: '/',
    envDir: path.resolve(__dirname, '../..'),
    mode: env.NODE_ENV || mode,
    server: {
      host: '0.0.0.0',
      port: 3500,
    },
    define: {
      NODE_ENV: JSON.stringify(env.NODE_ENV || mode),
    },
    resolve: {
      alias: {
        src: path.resolve(__dirname, 'src'),
        components: path.resolve(__dirname, 'src/components'),
        composables: path.resolve(__dirname, 'src/composables'),
        config: path.resolve(__dirname, 'src/config'),
        pages: path.resolve(__dirname, 'src/pages'),
        styles: path.resolve(__dirname, 'src/styles'),
        utils: path.resolve(__dirname, 'src/utils'),
        contracts: path.resolve(__dirname, '../../../contracts/src'),
      },
      dedupe: ['@nuxt/ui', 'vue', 'vue-router'],
      extensions: ['.tsx', '.ts', '.jsx', '.js', '.vue', '.json'],
    },
    plugins: [
      vue(),
      vueJsx(),
      ui({ autoImport: false, components: false, colorMode: false }),
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
        dts: 'src/types/auto-imports.d.ts',
      }),
    ],
    build: {
      target: 'esnext',
    },
    test: {
      globals: true,
      environment: 'happy-dom',
      include: ['src/**/*.test.ts'],
      setupFiles: ['../../setup-localstorage.ts'],
    },
  };
});