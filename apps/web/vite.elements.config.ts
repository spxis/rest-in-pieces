import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
export default defineConfig({
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
