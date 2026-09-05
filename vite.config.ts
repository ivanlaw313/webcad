import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The OCCT (C++ -> WASM) glue must not be pre-bundled by esbuild.
  optimizeDeps: { exclude: ['replicad-opencascadejs', 'replicad', '@salusoft89/planegcs'] },
  // Build the CAD worker as an ES module so `import.meta` + `?url` resolve correctly.
  worker: { format: 'es' },
  // Keep the entry URL revisioned as well as content-hashed.  The deploy
  // server serves assets with a long cache lifetime; without a revision
  // segment, a browser can retain an older main bundle at the same URL after
  // a successful deploy.
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash]-r2.js',
        // Keep framework, 3D renderer and CAD/constraint runtimes independently cacheable.
        // This does not change any modelling code, but avoids invalidating a multi-megabyte
        // application entry whenever a small UI component changes.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@react-three') || id.includes('/three/')) return 'three-runtime'
          if (id.includes('react-dom') || id.includes('/react/')) return 'react-runtime'
          if (id.includes('replicad') || id.includes('planegcs') || id.includes('manifold-3d')) return 'cad-runtime'
          return 'vendor'
        },
      },
    },
  },
})
