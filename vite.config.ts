import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 每次 build 把 dist/sw.js 嘅 __WEBCAD_BUILD_ID__ 換成唯一 id（時間 + 隨機）→ 每次部署 sw.js 位元組都變，
// 瀏覽器即刻更新 SW、清走舊 build 快取，唔會再由 SW 返回舊 index.html／舊 bundle。
function webcadSwBuildId() {
  let outDir = 'dist'
  return {
    name: 'webcad-sw-build-id',
    apply: 'build' as const,
    configResolved(c: { root: string; build: { outDir: string } }) { outDir = resolve(c.root, c.build.outDir) },
    closeBundle() {
      const f = resolve(outDir, 'sw.js')
      if (!existsSync(f)) return
      const id = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 8)
      writeFileSync(f, readFileSync(f, 'utf8').replace(/__WEBCAD_BUILD_ID__/g, id))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), webcadSwBuildId()],
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
