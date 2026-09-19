import type { AppState } from '../store'
import { msg, type LangInput } from '../i18n'

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
  const lang = (s.lang ?? 'zh-HK') as LangInput
  if (VIEW_COMMANDS.has(id)) return null
  if (s.skDrag && id !== 'act:undo') return msg('ui.disabled.skDrag', lang)
  if (s.busy) return msg('ui.disabled.busy', lang)
  if (activeModelCommand(s)) return msg('ui.disabled.activeCmd', lang)
  if (s.mode === 'pickplane') return msg('ui.disabled.pickPlane', lang)
  if (s.mode === 'sketch') {
    if (id.startsWith('sk_') || SKETCH_OK_CMDS.has(id)) return null
    return msg('ui.disabled.finishSketch', lang)
  }
  if (id.startsWith('sk_')) return msg('ui.disabled.openSketch', lang)
  if (s.formMode && new Set(['formsketch', 'formextrude', 'formrevolve', 'formsweep', 'formloft', 'formrepair', 'forminsert', 'formbridge', 'formweld', 'formfillhole', 'formerasefill']).has(id)) return msg('ui.disabled.formUnsupported', lang)
  if (s.formMode && s.formCage && new Set(['formbox','formplane','formcyl','formcylinder','formsphere','formtorus','formquadball','formface','formpatch','formpipe']).has(id)) return msg('ui.disabled.formBusy', lang)
  if (s.formMode && !id.startsWith('form') && !['measureuni', 'select', 'offsetplane', 'createform', 'act:undo', 'act:redo', 'act:save'].includes(id)) return msg('ui.disabled.finishForm', lang)
  return null
}
