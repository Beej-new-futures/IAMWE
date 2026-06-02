import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0, // never inline .glb / .hdr files as base64
  },
})
