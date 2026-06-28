import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: [] })],
    build: {
      rollupOptions: {
        external: ['node-pty']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        // Desktop SPA + the phone remote client are separate HTML entries.
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          mobile: resolve(__dirname, 'src/renderer/mobile.html')
        }
      }
    }
  }
})
