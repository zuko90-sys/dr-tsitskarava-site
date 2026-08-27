import { defineConfig } from 'vite';

export default defineConfig({
  // Относительные пути, чтобы сборка открывалась из любой папки и с любого хоста
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: { output: { entryFileNames: 'app.js', assetFileNames: 'app.[ext]' } },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
