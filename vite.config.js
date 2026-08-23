import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const r = (p) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0, // never inline .glb / .hdr files as base64
    rollupOptions: {
      input: {
        main: r('./index.html'),
        work: r('./work/index.html'),
        workDuaLipa: r('./work/dua-lipa/index.html'),
        workDrake: r('./work/drake/index.html'),
        workAttenborough: r('./work/attenborough/index.html'),
        workGucci: r('./work/gucci/index.html'),
        workLiamGallagher: r('./work/liam-gallagher/index.html'),
      },
    },
  },
})
