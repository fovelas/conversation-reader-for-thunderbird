import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        background: 'background.html',
        options: 'options.html',
        mockup: 'mockup.html',
      },
    },
  },
})
