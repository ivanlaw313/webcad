import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useApp } from './store'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// DEV：暴露 store 到 window 供控制台验证（window.useApp.getState() — 同 cadService 暴露 window.cad 一致）。生产关闭 → 无副作用。
// DEV / isolated browser acceptance only: expose state for deterministic e2e
// assertions. `?ui-test=1` bypasses project restore/autosave, so it never
// exposes an operator's live document through the normal production UI.
if (typeof window !== 'undefined' && (import.meta.env.DEV || new URLSearchParams(window.location.search).has('ui-test'))) (window as unknown as { useApp?: unknown }).useApp = useApp

// PWA 离线（T739）：生产先注册（dev 注册会同 Vite HMR 打交）。SW 策略见 public/sw.js ——
// 导航 network-first（永远攞最新版）、/assets+wasm cache-first（断网照开 app，免重复下载 wasm）。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* 注册失败（如 http 非 localhost）静默 — app 照行 */ }) })
}

// T808（测试报告观察 J）：stale-chunk 全局兜底。重新部署后资产 hash 全变、旧 lazy chunk 被删，
// 长开分页触发按需载入（CAM 刀路/FEA/工程图…）会 `Failed to fetch dynamically imported module`（404）。
// Vite 喺 __vitePreload 失败时派 `vite:preloadError`；统一捕捉 → 显示「新版本，请刷新」横幅（覆盖所有动态 import，
// 唔使逐个 feature 处理）。preventDefault 阻止默认抛错噪音。纯 DOM（React 状态坏咗都照显），一次性。
let _updateBannerShown = false
function showUpdateBanner() {
  if (_updateBannerShown || typeof document === 'undefined') return
  _updateBannerShown = true
  const d = document.createElement('div')
  d.setAttribute('role', 'alert')
  d.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:99999;background:#1f2a37;color:#fff;padding:10px 16px;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.38);font:14px/1.45 system-ui,sans-serif;display:flex;gap:12px;align-items:center;max-width:92vw'
  const span = document.createElement('span')
  span.textContent = '🔄 已发布新版本 — 部分功能需刷新后先可用。'
  const btn = document.createElement('button')
  btn.textContent = '刷新'
  btn.style.cssText = 'background:#2b6cf0;color:#fff;border:none;border-radius:6px;padding:5px 14px;cursor:pointer;font-weight:600;flex-shrink:0'
  btn.onclick = () => location.reload()
  d.append(span, btn)
  document.body.appendChild(d)
}
window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); showUpdateBanner() })
// 后备：原生动态 import 失败（非经 __vitePreload，或 unhandledrejection）亦兜
window.addEventListener('unhandledrejection', (e) => {
  const msg = String((e?.reason && (e.reason.message || e.reason)) || '')
  if (/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(msg)) showUpdateBanner()
})
