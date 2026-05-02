import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    commonjsOptions: {
      // Turndown's ESM bundle contains a literal `require('@mixmark-io/domino')`
      // call. Without this flag, rollup-plugin-commonjs leaves it untouched and
      // the packaged app crashes at startup because Forge strips node_modules
      // from the asar after copying. Enabling mixed-module transforms lets the
      // require be statically resolved and bundled.
      transformMixedEsModules: true,
    },
  },
});
