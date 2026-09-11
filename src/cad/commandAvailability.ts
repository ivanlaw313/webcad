import type { AppState } from '../store'

type Context = Partial<Pick<AppState, 'mode' | 'skDrag' | 'formMode' | 'formCage' | 'formCreateKind' | 'busy' | 'featDlg' | 'holeMode' | 'shellMode' | 'pushPullMode' | 'edgeRoundPick' | 'faceFilletMode' | 'draftPickMode' | 'extrudeDlgOpen' | 'sweepDlgOpen' | 'loftDlgOpen' | 'moveFaceMode' | 'rotateFaceMode' | 'lang'>>

export const SKETCH_OK_CMDS = new Set(['sketch', 'csketch', 'select', 'measure', 'measureuni', 'measureedge', 'measureface', 'measureangle', 'properties', 'delete', 'appearance', 'params', 'sketcharray', 'extrude', 'revolve', 'sweep', 'pipe', 'loft', 'rib', 'pathpattern', 'act:save', 'act:undo', 'act:redo', 'act:params'])
const VIEW_COMMANDS = new Set(['act:fit', 'act:help'])

export function activeModelCommand(s: Context): string | null {
  if (s.featDlg) return s.featDlg.kind
  if (s.extrudeDlgOpen) return 'extrude'
  if (s.sweepDlgOpen) return 'sweep'
  if (s.loftDlgOpen) return 'loft'
  if (s.holeMode) return 'hole'
  if (s.shellMode) return 'shell'
  if (s.pushPullMode) return 'presspull'
  if (s.edgeRoundPick !== null && s.edgeRoundPick !== undefined) return 'edge-round'
  if (s.faceFilletMode) return 'face-fillet'
  if ((s.draftPickMode ?? 0) > 0) return 'draft'
  if (s.moveFaceMode) return 'move-face'
  if (s.rotateFaceMode) return 'rotate-face'
  return null
}

// A primitive subscription key: no new objects on every Zustand read.
export function commandContextKey(s: Context): string {
  return `${s.mode}|${!!s.skDrag}|${!!s.formMode}|${!!s.formCage}|${s.formCreateKind}|${!!s.busy}|${activeModelCommand(s)}|${s.lang}`
}

/** Shared by ribbon, command search and dispatch. Never discard a command draft. */
export function commandDisabledReason(s: Context, id: string): string | null {
  const en = s.lang === 'en'
  if (VIEW_COMMANDS.has(id)) return null
  if (s.skDrag && id !== 'act:undo') return en ? 'Release to finish dragging, or press Esc to cancel.' : '请先放开鼠标完成拖动，或按 Esc 取消。'
  if (s.busy) return en ? 'Wait for the current calculation.' : '正在计算，请稍候。'
  if (activeModelCommand(s)) return en ? 'Confirm or cancel the current command first.' : '请先确定或取消当前命令；输入内容会保留。'
  if (s.mode === 'pickplane') return en ? 'Choose a sketch plane, or press Esc to cancel.' : '请先选择草图平面，或按 Esc 取消。'
  if (s.mode === 'sketch') {
    if (id.startsWith('sk_') || SKETCH_OK_CMDS.has(id)) return null
    return en ? 'Finish the sketch before using this command.' : '请先完成草图，再使用此命令。'
  }
  if (id.startsWith('sk_')) return en ? 'Open a sketch to use this tool.' : '请先进入草图，再使用此工具。'
  if (s.formMode && new Set(['formsketch', 'formextrude', 'formrevolve', 'formsweep', 'formloft', 'formrepair', 'forminsert', 'formbridge', 'formweld', 'formfillhole', 'formerasefill']).has(id)) return en ? 'This Form command is not supported yet.' : '此 Form 命令尚未支援。'
  if (s.formMode && s.formCage && new Set(['formbox','formplane','formcyl','formcylinder','formsphere','formtorus','formquadball','formface','formpatch','formpipe']).has(id)) return en ? 'Finish or cancel this Form before creating another.' : '请先完成或取消当前 Form，再创建另一件。'
  if (s.formMode && !id.startsWith('form') && !['measureuni', 'select', 'offsetplane', 'createform', 'act:undo', 'act:redo', 'act:save'].includes(id)) return en ? 'Finish Form before changing environments.' : '请先完成 Form，再切换环境。'
  return null
}
