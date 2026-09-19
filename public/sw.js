// WebCAD service worker（T739 PWA 离线）— 自写零依赖（license-safe）。
// 策略：
//   · 导航请求（开 app）：network-first，离线时退回缓存嘅 index.html —— 永远攞最新版，断网照开。
//   · /assets/*（Vite 内容哈希，不可变）+ .wasm/.ttf：cache-first —— 命中即离线可用，免重复下载几 MB wasm。
//   · 其他同源 GET：network-first + 缓存兜底。
// 版本：CACHE 名带版本号；activate 时清旧缓存。部署新版后首次在线访问会自动换新（导航 network-first 保证）。
// RELEASE: CACHE 必须随每次发版改名（例 webcad-v1.95），否则 activate 唔会删旧缓存 → 硬刷新仍见旧 badge（Solid @1.66 GATE）。
const CACHE = 'webcad-v1.95'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // 第三方请求唔掂

  // 导航（HTML）：network-first，离线退缓存 index
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); return res })
        .catch(() => caches.match('/')),
    )
    return
  }

  // 不可变资产（内容哈希 / wasm / 字体）：cache-first
  const immutable = url.pathname.startsWith('/assets/') || url.pathname.endsWith('.wasm') || url.pathname.endsWith('.ttf')
  if (immutable) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
        return res
      })),
    )
    return
  }

  // 其他同源 GET：network-first + 缓存兜底
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
        return res
      })
      .catch(() => caches.match(req)),
  )
})
