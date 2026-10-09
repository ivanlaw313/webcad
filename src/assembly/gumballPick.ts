// RETEST18 #1：關節子件 gumball（旋轉環 / 滑動箭頭）嘅指標路徑 — 純函數 + 細 registry（唔 import store/React）。
//
// 根因（live）：
//   ① Viewport 外層 div 嘅 onPointerDownCapture（選取工具 = 框選/套索）喺 React 根 capture 階段 stopPropagation，
//      R3F（掛喺 canvas 父 div）同 drei PivotControls 根本收唔到 pointerdown → 環/箭頭永遠拎唔到。
//   ② OrbitControls 直接聽 canvas（target 階段），早過 R3F（父 div bubble）→ 要等 drei AxisRotator 先關 controls；
//      撳中把手嗰下 Orbit 已經開始咗一個手勢。
//   ③ R3F 按距離排序命中：組件網格喺把手前面時把手排後（depthTest=false 只係畫喺面頭，唔影響 raycast 次序）。
// 解法：gumball 掛載時註冊一個 hit tester（用同一部相機 raycast 把手物件）。外層 capture 先問佢 —— 撳中把手就
// 唔開框選、即刻 disable OrbitControls（放手先還原），R3F filter 再將把手命中排最前。
import type { Intersection, Object3D } from 'three'

export const GUMBALL_TAG = 'webcadGumball'
export const GUMBALL_USERDATA: Record<string, unknown> = { [GUMBALL_TAG]: true }

export function isGumballObject(o: Object3D | null | undefined): boolean {
  for (let p: Object3D | null | undefined = o; p; p = p.parent) if (p.userData && p.userData[GUMBALL_TAG]) return true
  return false
}

/** R3F events.filter：把手命中排最前（穩定分區，其餘次序不變）— 把手喺零件後面都拎得到。
 *  RETEST19 #4：dropGumball = 右鍵／中鍵（drei 把手唔分掣，右鍵會開始拖拉＋食咗事件）→ 剔走把手命中，右鍵落到組件本身開菜單。 */
export function gumballFirst<T extends Pick<Intersection, 'object'>>(hits: T[], dropGumball = false): T[] {
  const g: T[] = [], rest: T[] = []
  for (const h of hits) (isGumballObject(h.object) ? g : rest).push(h)
  if (dropGumball) return g.length ? rest : hits
  return g.length ? [...g, ...rest] : hits
}

/** 呢個 DOM 事件係咪非主鍵（右鍵／中鍵）嘅按下／放開／contextmenu — 把手唔應該接。pointermove（button -1）唔計。 */
export function isSecondaryButtonEvent(ev: { type?: string; button?: number } | null | undefined): boolean {
  if (!ev) return false
  if (ev.type === 'contextmenu' || ev.type === 'auxclick') return true
  return (ev.type === 'pointerdown' || ev.type === 'pointerup' || ev.type === 'mousedown' || ev.type === 'mouseup') && (ev.button ?? 0) > 0
}

type Tester = (clientX: number, clientY: number) => boolean
type Ctl = { enabled: boolean } | null | undefined
let _tester: Tester | null = null
let _controls: () => Ctl = () => null

/** ComponentGumball 掛載時註冊（卸載時傳 null）。controls = 而家嘅 OrbitControls（R3F state.controls）。 */
export function registerGumballHitTester(t: Tester | null, controls?: () => Ctl): void {
  _tester = t
  _controls = t && controls ? controls : () => null
}

export function gumballHitAt(clientX: number, clientY: number): boolean {
  try { return !!_tester && _tester(clientX, clientY) } catch { return false }
}

/**
 * Viewport 外層 onPointerDownCapture 第一步：撳中把手 → disable OrbitControls（喺 canvas 上嘅 Orbit pointerdown 之前），
 * 放手（pointerup/cancel，window capture）先還原；回傳 true = 呼叫者唔好開框選/套索、唔好 stopPropagation。
 */
export function claimGumballPointer(clientX: number, clientY: number, win: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = typeof window !== 'undefined' ? window : null): boolean {
  if (!gumballHitAt(clientX, clientY)) return false
  const c = _controls()
  if (c) {
    const was = c.enabled
    c.enabled = false
    if (win) {
      const up = () => { win.removeEventListener('pointerup', up, true); win.removeEventListener('pointercancel', up, true); c.enabled = was }
      win.addEventListener('pointerup', up, true)
      win.addEventListener('pointercancel', up, true)
    }
  }
  return true
}
