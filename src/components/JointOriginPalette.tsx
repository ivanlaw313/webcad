import { useApp } from '../store'
import { normalizeLang, type Lang } from '../i18n'

// Fusion-style command palette for the canvas-pick portion of Joint Origin.
// Keeping this separate from JointsPanel means it is available before a joint
// exists, exactly when the user is choosing the reference frame.
// FISHING101：panel title / mode / hint chrome i18n en/ja/zh-CN/zh-HK（JA/EN 唔再 TC 關節原點 fallback）。
// ⚠ 唔好用 tStatus() 译【面板標題】长句—— EN 会出半中半英；改显式四套字串（同 JointsPanel FISHING100）。

type JoChrome = {
  title: string
  cancelTip: string
  simple: string
  twoFaces: string
  twoEdges: string
  hintSimple: string
  hintFace1: string
  hintFace2: string
  hintEdge1: string
  hintEdge2: string
  footer: string
}

const ZH: JoChrome = {
  title: '關節原點',
  cancelTip: '取消關節原點命令',
  simple: '簡單',
  twoFaces: '兩面之間',
  twoEdges: '兩邊交點',
  hintSimple: '請在畫布選取面心、圓柱孔心或頂點。',
  hintFace1: '請在畫布選取第一個平面或圓柱面。',
  hintFace2: '已選第一面。請在畫布選取第二個平面或圓柱面。',
  hintEdge1: '請在活動實體選取第一條直邊。',
  hintEdge2: '已選第一條邊。請選取第二條相交直邊。',
  footer: '建立後可在瀏覽器「關節原點」資料夾引用或刪除。',
}
const EN: JoChrome = {
  title: 'Joint origin',
  cancelTip: 'Cancel joint origin command',
  simple: 'Simple',
  twoFaces: 'Between two faces',
  twoEdges: 'Edge intersection',
  hintSimple: 'Pick a face center, cylinder hole center, or vertex on the canvas.',
  hintFace1: 'Pick the first planar or cylindrical face on the canvas.',
  hintFace2: 'First face selected. Pick the second planar or cylindrical face.',
  hintEdge1: 'Pick the first straight edge on the active body.',
  hintEdge2: 'First edge selected. Pick the second intersecting straight edge.',
  footer: 'After create, reference or delete it under Browser → Joint origins.',
}
const JA: JoChrome = {
  title: 'ジョイント原点',
  cancelTip: 'ジョイント原点コマンドをキャンセル',
  simple: 'シンプル',
  twoFaces: '2面の間',
  twoEdges: '辺の交点',
  hintSimple: 'キャンバスで面心・円柱穴心・頂点を選んでください。',
  hintFace1: 'キャンバスで最初の平面または円柱面を選んでください。',
  hintFace2: '第1面を選択済み。第2の平面または円柱面を選んでください。',
  hintEdge1: 'アクティブボディで最初の直線辺を選んでください。',
  hintEdge2: '第1辺を選択済み。交差する第2の直線辺を選んでください。',
  footer: '作成後はブラウザ「ジョイント原点」フォルダで参照／削除できます。',
}
const ZH_CN: JoChrome = {
  title: '关节原点',
  cancelTip: '取消关节原点命令',
  simple: '简单',
  twoFaces: '两面之间',
  twoEdges: '两边交点',
  hintSimple: '请在画布选取面心、圆柱孔心或顶点。',
  hintFace1: '请在画布选取第一个平面或圆柱面。',
  hintFace2: '已选第一面。请在画布选取第二个平面或圆柱面。',
  hintEdge1: '请在活动实体选取第一条直边。',
  hintEdge2: '已选第一条边。请选取第二条相交直边。',
  footer: '建立后可在浏览器「关节原点」文件夹引用或删除。',
}

function pickJoChrome(lang: Lang | string | undefined): JoChrome {
  const L = normalizeLang(lang)
  return L === 'en' ? EN : L === 'ja' ? JA : L === 'zh-CN' ? ZH_CN : ZH
}

export default function JointOriginPalette() {
  const lang = useApp((s) => s.lang)
  const chrome = pickJoChrome(lang)
  const active = useApp((s) => s.jointOriginPickMode)
  const mode = useApp((s) => s.jointOriginMode)
  const first = useApp((s) => s.jointOriginFirst)
  if (!active) return null

  const begin = (next: 'simple' | 'twoFaces' | 'twoEdges') => useApp.getState().startJointOriginPick(next)
  const hint = mode === 'twoFaces'
    ? (first ? chrome.hintFace2 : chrome.hintFace1)
    : mode === 'twoEdges'
      ? (first ? chrome.hintEdge2 : chrome.hintEdge1)
      : chrome.hintSimple
  return (
    <div className="cmd-palette" style={{ position: 'fixed', right: 14, top: 132, width: 268, zIndex: 120 }}>
      <div className="cmd-palette-head">
        <b>{chrome.title}</b>
        <button className="cs-x" title={chrome.cancelTip} onClick={() => useApp.getState().cancelJointOriginPick()}>×</button>
      </div>
      <div className="cmd-palette-body" style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 5 }}>
          <button className={'cs-btn' + (mode === 'simple' ? ' on' : '')} style={{ flex: 1 }} onClick={() => begin('simple')}>{chrome.simple}</button>
          <button className={'cs-btn' + (mode === 'twoFaces' ? ' on' : '')} style={{ flex: 1 }} onClick={() => begin('twoFaces')}>{chrome.twoFaces}</button>
          <button className={'cs-btn' + (mode === 'twoEdges' ? ' on' : '')} style={{ flex: 1 }} onClick={() => begin('twoEdges')}>{chrome.twoEdges}</button>
        </div>
        <div style={{ color: '#53616b', fontSize: 12, lineHeight: 1.45 }}>{hint}</div>
        <div style={{ color: '#8a939c', fontSize: 11 }}>{chrome.footer}</div>
      </div>
    </div>
  )
}
