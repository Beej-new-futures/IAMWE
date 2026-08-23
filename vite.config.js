import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const r = (p) => fileURLToPath(new URL(p, import.meta.url))
const here = dirname(fileURLToPath(import.meta.url))

// Every project page is work/<slug>/index.html, and Vite only builds the
// pages named here — anything left out is simply absent from dist, which
// looks fine locally (the dev server reads straight off disk, so an
// unlisted page still opens) and 404s in production. This list used to be
// written by hand and drifted: it still named a project that had been
// dropped, and was missing four that had been added. Discovering the
// pages instead means adding or removing a project never needs this file
// touched again.
const workDir = join(here, 'work')
const projects = Object.fromEntries(
  readdirSync(workDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(workDir, d.name, 'index.html')))
    .map((d) => [`work-${d.name}`, join(workDir, d.name, 'index.html')])
)

export default defineConfig({
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0, // never inline .glb / .hdr files as base64
    rollupOptions: {
      input: {
        main: r('./index.html'),
        work: r('./work/index.html'),
        ...projects,
      },
    },
  },
})
