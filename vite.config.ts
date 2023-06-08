import { defineConfig } from 'vite'
import eslint from 'vite-plugin-eslint'
import dotenv from 'dotenv'

dotenv.config()

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  },
  build: {
    lib: {
      entry: 'index.html',
      formats: ['es'],
    },
    rollupOptions: {
      input: {
        frontend: 'index.html',
        background: 'background.html',
        options: 'options.html',
      },
      output: {
        entryFileNames: '[name].js',
        dir: 'dist',
      },
    },
  },
  plugins: [eslint()],
})
