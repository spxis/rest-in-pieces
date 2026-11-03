import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { thirdPartyLicences } from '../../scripts/third-party-licences.mjs';
export default defineConfig({
  plugins: [thirdPartyLicences({ title: 'Third-party licences of the browser elements and shared chunks' })],
  build: {
    target: 'es2022',
    outDir: '../api/dist',
    emptyOutDir: false,
    lib: {
      entry: {
        element: fileURLToPath(new URL('../api/src/element.ts', import.meta.url)),
        'element-define': fileURLToPath(new URL('../api/src/element-define.ts', import.meta.url)),
      },
      formats: ['es'],
    },
    rollupOptions: { output: { entryFileNames: '[name].js', chunkFileNames: 'embed-[name]-[hash].js' } },
  },
});
